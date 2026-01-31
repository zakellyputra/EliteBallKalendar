// Gemini API client for AI rescheduling

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

You will receive context about the user's:
- Current schedule (focus blocks and calendar events)
- Working window settings
- Goals and their target hours

Based on the user's request, you must output ONLY valid JSON with no prose before or after. The JSON must follow this exact schema:

{
  "intent": "reschedule",
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
3. When moving blocks, ensure the new time doesn't conflict with existing events
4. When creating blocks, respect the user's working window
5. Keep the user_message concise and friendly
6. If you can't fulfill the request, explain why in user_message and set operations to empty array`;

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
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Gemini] API error:', error);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
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
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fixPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Fix prompt failed');
    }

    const data = await response.json();
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
