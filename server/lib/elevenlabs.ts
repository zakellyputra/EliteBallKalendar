// ElevenLabs API client for Text-to-Speech and Speech-to-Text

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Default voice ID (Rachel - conversational)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export async function textToSpeech(text: string, voiceId?: string): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) {
    console.log('[ElevenLabs] No API key configured, skipping TTS');
    return null;
  }

  try {
    const response = await fetch(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('[ElevenLabs] TTS error:', response.status, response.statusText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[ElevenLabs] TTS error:', error);
    return null;
  }
}

export async function speechToText(audioBuffer: Buffer, mimeType: string = 'audio/webm'): Promise<string | null> {
  if (!ELEVENLABS_API_KEY) {
    console.log('[ElevenLabs] No API key configured, skipping STT');
    return null;
  }

  try {
    // ElevenLabs doesn't have native STT, so we'll use their new Scribe model or fall back
    // For hackathon, we'll use a simple approach with the audio isolation endpoint
    // or suggest using browser's native SpeechRecognition API as fallback
    
    // Note: ElevenLabs primarily focuses on TTS. For STT, we can use:
    // 1. Browser's SpeechRecognition API (free, client-side)
    // 2. Google Cloud Speech-to-Text
    // 3. OpenAI Whisper
    
    // For hackathon MVP, return null and use browser's native API on frontend
    console.log('[ElevenLabs] STT not implemented - use browser SpeechRecognition');
    return null;
  } catch (error) {
    console.error('[ElevenLabs] STT error:', error);
    return null;
  }
}

export async function getVoices(): Promise<{ voice_id: string; name: string }[]> {
  if (!ELEVENLABS_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error('[ElevenLabs] Get voices error:', error);
    return [];
  }
}
