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
    // Determine file extension from mime type
    let fileExtension = 'webm';
    if (mimeType.includes('wav')) fileExtension = 'wav';
    else if (mimeType.includes('mp3')) fileExtension = 'mp3';
    else if (mimeType.includes('m4a')) fileExtension = 'm4a';
    else if (mimeType.includes('ogg')) fileExtension = 'ogg';
    
    // Create FormData for multipart/form-data upload
    // In Node.js 18+, FormData and Blob are available globally
    const formData = new FormData();
    
    // Create a Blob from the buffer (Node.js 18+ supports Blob)
    const blob = new Blob([audioBuffer], { type: mimeType });
    // Append blob with filename - FormData in Node.js accepts Blob directly
    formData.append('audio', blob, `audio.${fileExtension}`);
    formData.append('model_id', 'scribe_v2'); // Use latest Scribe model

    const response = await fetch(
      `${ELEVENLABS_BASE_URL}/speech-to-text`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          // Don't set Content-Type header - FormData will set it with boundary
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ElevenLabs] STT error:', response.status, response.statusText, errorText);
      return null;
    }

    const data = await response.json();
    // ElevenLabs returns { text: "...", language_code: "...", words: [...] }
    return data.text || null;
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
