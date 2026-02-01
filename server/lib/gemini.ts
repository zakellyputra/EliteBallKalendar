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
  type?: 'focus' | 'break' | 'reminder'; // New field to distinguish block types
  blockId?: string;
  goalName?: string;
  title?: string; // Name of the event/block being moved or created
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

const SYSTEM_PROMPT = `You are an AI scheduling assistant for EliteBallKalendar. Your job is to help users reschedule their focus blocks, add breaks, and set reminders based on natural language requests.

You will receive context about the user's:
- Current schedule (focus blocks and calendar events)
- Working window settings (which days/hours are enabled for focus work)
- Goals and their target hours

Based on the user's request AND the conversation history, you must output ONLY valid JSON with no prose before or after. The JSON must follow this exact schema:

{
  "intent": "reschedule" | "confirm_outside_hours" | "clarify",
  "reason": "Brief explanation of what you're doing",
  "operations": [
    {"op": "move", "blockId": "xxx", "title": "Event Name", "from": "ISO_DATE", "to": "ISO_DATE"},
    {"op": "create", "type": "focus", "goalName": "CS251", "title": "Focus Block: CS251", "start": "ISO_DATE", "end": "ISO_DATE"},
    {"op": "create", "type": "break", "title": "Coffee Break", "start": "ISO_DATE", "end": "ISO_DATE"},
    {"op": "create", "type": "reminder", "title": "Call Mom", "start": "ISO_DATE", "end": "ISO_DATE"},
    {"op": "delete", "blockId": "xxx", "title": "Event Name"}
  ],
  "user_message": "Friendly message to show the user about what you did or asking for clarification"
}

Rules:
1. Only output JSON, no other text.
2. Use ISO 8601 format for all dates (e.g., "2026-01-31T14:00:00.000Z").
3. **Session Memory & Context**: 
    - CRITICAL: You must READ the conversation history to understand the user's intent.
    - If the user provides partial info (e.g., "start at 2pm"), look at the previous messages to find what they are talking about (e.g., a "2-hour break").
    - MERGE the new info with the previous intent. Do NOT treat the new message as a standalone request if it's clearly a follow-up.
    - Example: User says "I need a break", you ask "When?", User says "2pm". -> You must create a break at 2pm.
 4. **Block Types & Validation**:
    - **Focus Blocks** (type="focus"): REQUIRE a "goalName" from the user's goals. Only use this if the user mentions a goal or "focus work".
    - **Breaks** (type="break"): Do NOT require a goal. Create these when the user asks for a "break", "rest", "lunch", etc.
    - **Reminders** (type="reminder"): Do NOT require a goal. Create these for specific tasks like "call mom", "email boss".
 5. **Handling Empty Time**:
    - Do NOT assume empty time means the user "already has a break".
    - If the user explicitly asks for a break, SCHEDULE IT as a distinct event (op="create", type="break").
 6. **Clarification**: If the request is ambiguous (e.g., "schedule a block" but no goal/time specified), set intent="clarify", operations=[], and ask the user for details in user_message.
 7. **Time Conflicts**: Check for conflicts. If a move/create conflicts, try to find the next available slot or ask the user.
 8. **External Events**: You can move/delete "OTHER CALENDAR EVENTS" if requested. Use the ID provided in the context.
 9. **Outside Hours**: If the request is outside working hours, set intent="confirm_outside_hours" but STILL generate the operations.
 `;

export async function generateReschedule(
  userMessage: string,
  context: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<RescheduleResult> {
  console.log('--- [Gemini Debug] Start Request ---');
  console.log('User Message:', userMessage);
  console.log('Context Length:', context.length);
  console.log('History Items:', history.length);
  console.log('History Content:', JSON.stringify(history, null, 2));

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
    const historyParts = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const data = await callGemini({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        ...historyParts,
        {
          role: 'user',
          parts: [
            { text: `Context:\n${context}` },
            { text: `User request: ${userMessage}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });
    
    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Gemini');
    }

    // Try to parse JSON from response
    let parsed: RescheduleResult;
    try {
      // Remove any markdown code blocks if present
      const cleanText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('[Gemini] Failed to parse JSON:', text);
      
      // Retry with a "fix JSON" prompt
      return await retryWithFixPrompt(text);
    }

    // Validate required fields
    if (!parsed.intent || !parsed.operations || !parsed.user_message) {
      throw new Error('Invalid response structure from Gemini');
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

  const fixPrompt = `The following text should be valid JSON but isn't. Please fix it and return ONLY valid JSON:

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
        maxOutputTokens: 2048,
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

  console.log('[Gemini] FULL API PAYLOAD:', JSON.stringify(body, null, 2));

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

      if (response.status !== 404) {
        console.error('[Gemini] API error:', lastError);
        throw new Error(lastError);
      }
    }
  }

  console.error('[Gemini] API error:', lastError);
  throw new Error(lastError || 'Gemini API error: 404');
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
