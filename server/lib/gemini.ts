// Gemini API client for AI rescheduling

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PREFERRED_MODELS = [
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro-latest',
  'gemini-1.5-pro',
  'gemini-1.0-pro',
];
const FALLBACK_MODELS = ['gemini-1.5-flash-latest', 'gemini-1.5-flash'];
const DEFAULT_API_BASES = [
  'https://generativelanguage.googleapis.com/v1beta/models',
  'https://generativelanguage.googleapis.com/v1/models',
];
const GEMINI_MODELS = (process.env.GEMINI_MODEL || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const ACTIVE_API_BASES = (process.env.GEMINI_API_BASES || '')
  .split(',')
  .map((base) => base.trim())
  .filter(Boolean);
const GEMINI_API_BASES = ACTIVE_API_BASES.length > 0 ? ACTIVE_API_BASES : DEFAULT_API_BASES;
let cachedResolvedModels: string[] | null = null;

export interface RescheduleOperation {
  op: 'move' | 'create' | 'delete';
  blockId?: string;
  goalName?: string;
  from?: string;
  to?: string;
  start?: string;
  end?: string;
}

export interface RescheduleResult {
  intent: string;
  reason: string;
  operations: RescheduleOperation[];
  user_message: string;
}

const SYSTEM_PROMPT = `You are an AI scheduling assistant for EliteBallKalendar. Your job is to help users reschedule their focus blocks based on natural language requests.

Always use ISO 8601 timestamps for any start/end/to fields (e.g., 2026-02-06T14:00:00.000Z).

You will receive context about the user's:
- Current schedule (focus blocks and calendar events)
- Working window settings (which days/hours are enabled for focus work)
- Goals and their target hours

Based on the user's request, you must output ONLY valid JSON with no prose before or after. The JSON must follow this exact schema:

{
  "intent": "reschedule" | "confirm_outside_hours",
  "reason": "Brief explanation of what you're doing",
  "operations": [
    {"op": "move", "blockId": "xxx", "from": "ISO_DATE", "to": "ISO_DATE"},
    {"op": "create", "goalName": "CS251", "start": "ISO_DATE", "end": "ISO_DATE"},
    {"op": "delete", "blockId": "xxx"}
  ],
  "user_message": "Friendly message to show the user about what you did"
}

Rules:
1. Only output JSON, no other text
2. Use ISO 8601 format for all dates (e.g., "2026-01-31T14:00:00.000Z")
3. CRITICAL: NEVER schedule blocks to dates/times that have already passed. Always check the current date/time in the context and ensure all "to", "start", and "end" fields are in the future.
4. When moving blocks, ensure the new time doesn't conflict with existing events
5. CRITICAL: RESPECT WORKING WINDOW HOURS - THIS IS MANDATORY. The working window shows which days are enabled and the hours for each day (e.g., "monday": {"enabled": true, "start": "09:00", "end": "17:00"}). 
   - YOU MUST ALWAYS schedule blocks within the enabled days' start and end times - never schedule outside these bounds
   - Before outputting any "to", "start", or "end" timestamp, CHECK that the hour and minute fall within the day's working window
   - If a day is disabled (enabled: false), you can still schedule there but set intent to "confirm_outside_hours"
   - If scheduling to an enabled day, the start time MUST be >= the day's "start" time and end time MUST be <= the day's "end" time
   - Example: If Saturday has {"enabled": true, "start": "09:00", "end": "17:00"}, you can ONLY schedule blocks between 9:00 AM (09:00) and 5:00 PM (17:00) on Saturday
   - Example: If you schedule a block to Saturday at "2026-02-01T18:00:00.000Z" (6 PM), this is WRONG because 18:00 (6 PM) is after 17:00 (5 PM). You MUST use a time like "2026-02-01T14:00:00.000Z" (2 PM) instead.
   - VALIDATION STEP: Before outputting each operation, verify: (1) Extract the hour from your ISO timestamp, (2) Check the working window for that day, (3) Ensure hour >= start hour and hour <= end hour, (4) If hour equals start/end hour, check minutes too
   - If the user explicitly requests times outside working hours, set intent to "confirm_outside_hours" but STILL schedule within the working window bounds - do not schedule outside hours
6. If the user wants to move/create blocks OUTSIDE their working window (disabled days or outside hours), DO NOT refuse. Instead:
   - Set intent to "confirm_outside_hours"
   - Still include the operations the user requested
   - In user_message, note that this is outside their normal working hours and ask if they want to proceed
7. Keep the user_message concise and friendly (under 100 characters if possible)
8. If you truly can't fulfill the request (e.g., block doesn't exist, time conflict, or requested date is in the past), explain why in user_message and set operations to empty array
9. IMPORTANT: Look carefully at the FOCUS BLOCKS section in the context - these are the blocks you can move. Match block IDs exactly.
10. When providing "from" and "to" fields for move operations, both must be valid ISO 8601 timestamps. The "from" should match the block's current start time, and "to" must be a future date/time.
    - IMPORTANT: When setting "to" time, ensure that if you add the block duration to "to", the resulting end time is also within working hours
    - Example: If block is 30 minutes and working hours end at 17:00 (5 PM), don't schedule "to" at 16:45 (4:45 PM) because it would end at 17:15 (5:15 PM) - schedule it earlier, like 16:30 (4:30 PM) so it ends at 17:00 (5 PM)
11. CRITICAL: COUNT THE BLOCKS AND INCLUDE ALL OF THEM. If the user asks to reschedule "3 blocks", "all blocks", "my blocks", "multiple blocks", or refers to blocks in plural, you MUST include operations for EVERY SINGLE matching block in the operations array. 
   - Count how many blocks match the request (e.g., if user says "move my 3 CS340 blocks", count exactly 3 CS340 blocks)
   - Include a move operation for EACH AND EVERY matching block - do not skip any, do not stop early
   - If you cannot fit all operations, you MUST still include all of them - the JSON will be handled server-side
   - NEVER return fewer operations than the number of blocks requested - this is a critical error
   - Example: If user says "move my 3 focus blocks to Saturday" and there are 3 blocks listed, you MUST return exactly 3 move operations, one for each block ID
   - Double-check: Before finishing, count your operations and verify you have one operation per matching block
12. CRITICAL: When the user says "move back", "move it back", "undo", "revert", "move the focus block back", or similar phrases referring to moving something back:
   - Look for the "RECENTLY MOVED BLOCKS" section in the context
   - Identify the MOST RECENTLY MOVED block (marked with ⭐)
   - Use that block's blockId and move it back to its originalStart time (use originalStart as the "to" field)
   - The "from" field should be the block's current start time
   - If there are multiple recently moved blocks and the user doesn't specify which one, ALWAYS use the most recently moved one (marked with ⭐)
   - Example: If the context shows "⭐ MOST RECENT: [block123] CS340: Currently at 2026-02-06T14:00:00.000Z to 2026-02-06T14:30:00.000Z, originally at 2026-02-05T09:00:00.000Z to 2026-02-05T09:30:00.000Z", and user says "move it back", return: {"op": "move", "blockId": "block123", "from": "2026-02-06T14:00:00.000Z", "to": "2026-02-05T09:00:00.000Z"}
13. CRITICAL: Always close all brackets and braces properly. Include ALL operations even if the JSON is long - completeness is more important than brevity. Do not truncate the operations array - include every single operation.`;

export async function generateReschedule(
  userMessage: string,
  context: string
): Promise<RescheduleResult> {
  if (!GEMINI_API_KEY) {
    // Return mock response for development
    console.log('[Gemini] No API key configured, returning mock response');
    return {
      intent: 'reschedule',
      reason: 'Mock response - API key not configured',
      operations: [],
      user_message: "I'd help reschedule, but the Gemini API key isn't configured. Please add GEMINI_API_KEY to your .env file.",
    };
  }

  try {
    const data = await callGemini({
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            { text: `Context:\n${context}` },
            { text: `User request: ${userMessage}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096, // Increased to handle longer responses with multiple operations
      },
    });
    
    // Extract text from response
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    
    if (!text) {
      const finishReason = candidate?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('Response was truncated due to token limit. Please try with fewer operations or rephrase your request.');
      }
      throw new Error(`No response from Gemini. Finish reason: ${finishReason || 'unknown'}`);
    }
    
    // Check if response was truncated
    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.warn('[Gemini] Response may be truncated (MAX_TOKENS finish reason)');
    }

    // Try to parse JSON from response
    let parsed: RescheduleResult;
    try {
      // Remove any markdown code blocks if present
      let cleanText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      
      // Check if JSON appears to be truncated (doesn't end with } or ])
      const trimmedEnd = cleanText.trimEnd();
      const lastChar = trimmedEnd[trimmedEnd.length - 1];
      const isTruncated = (lastChar !== '}' && lastChar !== ']') || candidate?.finishReason === 'MAX_TOKENS';
      
      if (isTruncated) {
        console.warn('[Gemini] JSON appears truncated, attempting to extract complete operations...');
        
        // Try to extract complete operations from truncated JSON using a simpler, more efficient approach
        // Match operations array - be more flexible with the pattern
        const operationsMatch = cleanText.match(/"operations"\s*:\s*\[([\s\S]*)/);
        if (operationsMatch && operationsMatch[1]) {
          const operationsText = operationsMatch[1];
          console.log(`[Gemini] Found operations text (first 200 chars):`, operationsText.substring(0, 200));
          
          // Use a simpler regex-based approach to find complete JSON objects
          // This is more memory-efficient than character-by-character parsing
          const completeOps: string[] = [];
          let braceCount = 0;
          let startIdx = -1;
          let inString = false;
          let escapeNext = false;
          const maxLength = Math.min(operationsText.length, 10000); // Limit to prevent memory issues
          
          for (let i = 0; i < maxLength; i++) {
            const char = operationsText[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"') {
              inString = !inString;
            } else if (!inString) {
              if (char === '{') {
                if (braceCount === 0) {
                  startIdx = i; // Start of a new object
                }
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && startIdx >= 0) {
                  // Found a complete object
                  const opStr = operationsText.substring(startIdx, i + 1).trim();
                  if (opStr) {
                    try {
                      const op = JSON.parse(opStr);
                      // Validate required fields
                      if ((op.op === 'move' && op.blockId && op.to) ||
                          (op.op === 'create' && op.goalName && op.start && op.end) ||
                          (op.op === 'delete' && op.blockId)) {
                        completeOps.push(opStr);
                        console.log(`[Gemini] Extracted valid ${op.op} operation:`, op.blockId || op.goalName);
                      }
                    } catch (parseError) {
                      // Invalid JSON, skip it
                      console.log(`[Gemini] Skipped invalid operation (parse error):`, opStr.substring(0, 50));
                    }
                  }
                  startIdx = -1;
                }
              }
            }
          }
          
          // If we found complete operations, reconstruct the JSON
          if (completeOps.length > 0) {
            // Operations are already validated, just parse them (limit to prevent memory issues)
            const validOps: any[] = [];
            const maxOps = 100; // Increased limit to handle more operations (was 50)
            for (let i = 0; i < Math.min(completeOps.length, maxOps); i++) {
              try {
                const op = JSON.parse(completeOps[i]);
                validOps.push(op); // Already validated above
              } catch {
                // Skip invalid operations (shouldn't happen, but safety check)
              }
            }
            
            if (validOps.length > 0) {
              // Reconstruct the full JSON structure
              const intentMatch = cleanText.match(/"intent"\s*:\s*"([^"]+)"/);
              const reasonMatch = cleanText.match(/"reason"\s*:\s*"([^"]*)"/);
              const userMessageMatch = cleanText.match(/"user_message"\s*:\s*"([^"]*)"/);
              
              // Escape quotes in user_message if present
              let userMessage = userMessageMatch?.[1] || `Successfully rescheduled ${validOps.length} block(s).`;
              userMessage = userMessage.replace(/"/g, '\\"');
              
              let reason = reasonMatch?.[1] || 'Rescheduled blocks';
              reason = reason.replace(/"/g, '\\"');
              
              cleanText = `{
  "intent": "${intentMatch?.[1] || 'reschedule'}",
  "reason": "${reason}",
  "operations": ${JSON.stringify(validOps, null, 2)},
  "user_message": "${userMessage}"
}`;
              
              console.log(`[Gemini] Extracted ${validOps.length} complete operation(s) from truncated response`);
              console.log(`[Gemini] Reconstructed JSON preview:`, cleanText.substring(0, 200));
            } else {
              console.warn('[Gemini] No valid operations extracted from truncated response');
            }
          } else {
            console.warn('[Gemini] No complete operations found in truncated response');
          }
        }
        
        // If still truncated and we couldn't extract operations, try basic closing
        if (!cleanText.trim().endsWith('}')) {
          const openBraces = (cleanText.match(/{/g) || []).length;
          const closeBraces = (cleanText.match(/}/g) || []).length;
          const openBrackets = (cleanText.match(/\[/g) || []).length;
          const closeBrackets = (cleanText.match(/\]/g) || []).length;
          
          // Close arrays first, then objects
          while (openBrackets > closeBrackets) {
            cleanText += ']';
          }
          while (openBraces > closeBraces) {
            cleanText += '}';
          }
        }
      }
      
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('[Gemini] Failed to parse JSON:', text.substring(0, 500));
      console.log('[Gemini] Raw response length:', text.length);
      console.log('[Gemini] Last 200 chars:', text.substring(Math.max(0, text.length - 200)));
      
      // Retry with a "fix JSON" prompt
      return await retryWithFixPrompt(text);
    }

    // Validate required fields
    if (!parsed.intent || !parsed.operations || !parsed.user_message) {
      throw new Error('Invalid response structure from Gemini');
    }

    // Log how many operations were returned
    console.log(`[Gemini] Parsed ${parsed.operations.length} operation(s) from response`);

    for (const op of parsed.operations) {
      if (op.op === 'move' && (!op.to || !op.blockId)) {
        throw new Error('Invalid move operation returned by Gemini');
      }
      if (op.op === 'create' && (!op.start || !op.end || !op.goalName)) {
        throw new Error('Invalid create operation returned by Gemini');
      }
    }

    return parsed;
  } catch (error) {
    console.error('[Gemini] Error:', error);
    return {
      intent: 'error',
      reason: String(error),
      operations: [],
      user_message: "Sorry, I encountered an error while processing your request. Please try again.",
    };
  }
}

async function retryWithFixPrompt(invalidJson: string): Promise<RescheduleResult> {
  if (!GEMINI_API_KEY) {
    return {
      intent: 'error',
      reason: 'No API key',
      operations: [],
      user_message: "I couldn't understand the response format. Please try again.",
    };
  }

  // Check if JSON is truncated (ends abruptly)
  const isTruncated = !invalidJson.trim().endsWith('}') && !invalidJson.trim().endsWith(']');
  
  const fixPrompt = isTruncated 
    ? `The following JSON response was truncated mid-response. Please complete it and return ONLY valid, complete JSON:

${invalidJson}

Complete the JSON following this schema:
{
  "intent": "reschedule",
  "reason": "...",
  "operations": [
    {"op": "move", "blockId": "complete_the_block_id", "from": "ISO_DATE", "to": "ISO_DATE"}
  ],
  "user_message": "..."
}

Make sure all blockIds are complete and all operations have all required fields.`
    : `The following text should be valid JSON but isn't. Please fix it and return ONLY valid JSON:

${invalidJson}

Remember the required schema:
{
  "intent": "reschedule",
  "reason": "...",
  "operations": [...],
  "user_message": "..."
}`;

  try {
    const data = await callGemini({
      contents: [{ parts: [{ text: fixPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096, // Increased to match main request
      },
    });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanText = text?.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanText);
  } catch (error) {
    return {
      intent: 'error',
      reason: 'Failed to fix JSON',
      operations: [],
      user_message: "I had trouble formatting my response. Please try rephrasing your request.",
    };
  }
}

async function callGemini(body: Record<string, unknown>) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing');
  }

  let lastError: string | null = null;
  const models = await resolveModels();

  for (const apiBase of GEMINI_API_BASES) {
    for (const model of models) {
      const normalizedModel = model.startsWith('models/') ? model.slice('models/'.length) : model;
      const response = await fetch(`${apiBase}/${normalizedModel}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return response.json();
      }

      const errorText = await response.text();
      lastError = `Gemini API error ${response.status} (${apiBase}/${normalizedModel}): ${errorText}`;

      // 404 means model not found - try next model/base
      // 503 means service unavailable - try next model/base (might be temporary)
      // 429 means rate limit - try next model/base (different model might have different quota)
      // Other errors (400, 500, etc.) - log and try next model/base
      if (response.status === 404 || response.status === 503 || response.status === 429) {
        console.warn(`[Gemini] ${response.status === 404 ? 'Model not found' : response.status === 503 ? 'Service unavailable' : 'Rate limited'}, trying next option...`);
        continue; // Try next model/base
      }
      
      // For other errors (400, 500, etc.), log and continue trying other options
      console.error('[Gemini] API error (will try other models/bases):', lastError);
      continue; // Try next model/base instead of throwing immediately
    }
  }

  // If we've tried all models and bases, throw the last error
  console.error('[Gemini] All API attempts failed. Last error:', lastError);
  throw new Error(lastError || 'Gemini API error: All models and API bases failed');
}

async function resolveModels(): Promise<string[]> {
  if (cachedResolvedModels) {
    return cachedResolvedModels;
  }

  if (GEMINI_MODELS.length > 0) {
    cachedResolvedModels = GEMINI_MODELS;
    return cachedResolvedModels;
  }

  const discovered = await discoverModels();
  if (discovered.length > 0) {
    cachedResolvedModels = prioritizeModels(discovered);
    return cachedResolvedModels;
  }

  cachedResolvedModels = FALLBACK_MODELS;
  return cachedResolvedModels;
}

async function discoverModels(): Promise<string[]> {
  const discovered = new Set<string>();

  for (const apiBase of GEMINI_API_BASES) {
    try {
      const response = await fetch(`${apiBase}?key=${GEMINI_API_KEY}`);
      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const models: Array<{ name?: string; supportedGenerationMethods?: string[] }> = data.models || [];

      for (const model of models) {
        if (!model.name) {
          continue;
        }
        if (!model.supportedGenerationMethods?.includes('generateContent')) {
          continue;
        }
        discovered.add(normalizeModelName(model.name));
      }
    } catch {
      // Skip discovery failures and fall back to defaults.
    }
  }

  return Array.from(discovered);
}

function prioritizeModels(available: string[]): string[] {
  const availableSet = new Set(available.map((model) => normalizeModelName(model)));
  const preferred = PREFERRED_MODELS.filter((model) => availableSet.has(model));
  return preferred.length > 0 ? preferred : available;
}

function normalizeModelName(model: string): string {
  return model.startsWith('models/') ? model.slice('models/'.length) : model;
}
