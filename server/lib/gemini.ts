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
5. If the user wants to move/create blocks OUTSIDE their working window (disabled days or outside hours), DO NOT refuse. Instead:
   - Set intent to "confirm_outside_hours"
   - Still include the operations the user requested
   - In user_message, note that this is outside their normal working hours and ask if they want to proceed
6. Keep the user_message concise and friendly (under 100 characters if possible)
7. If you truly can't fulfill the request (e.g., block doesn't exist, time conflict, or requested date is in the past), explain why in user_message and set operations to empty array
8. IMPORTANT: Look carefully at the FOCUS BLOCKS section in the context - these are the blocks you can move. Match block IDs exactly.
9. When providing "from" and "to" fields for move operations, both must be valid ISO 8601 timestamps. The "from" should match the block's current start time, and "to" must be a future date/time.
10. CRITICAL: If the user asks to reschedule "all blocks", "my blocks", "multiple blocks", or refers to blocks in plural, you MUST include operations for ALL matching blocks in the operations array. Do not stop at just one block - include move operations for every block that matches the user's request.
11. CRITICAL: If you have many operations, prioritize completing the JSON structure. It's better to return fewer complete operations than many incomplete ones. Always close all brackets and braces properly.`;

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
            const maxOps = 50; // Limit operations to prevent memory issues
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
