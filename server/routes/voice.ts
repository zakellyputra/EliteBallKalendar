import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { textToSpeech, speechToText } from '../lib/elevenlabs';

const router = Router();

// Text to Speech
router.post('/tts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const audioBuffer = await textToSpeech(text, voiceId);

    if (!audioBuffer) {
      return res.status(503).json({ 
        error: 'TTS service unavailable. Please configure ELEVENLABS_API_KEY.' 
      });
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);
  } catch (err: any) {
    console.error('Error in TTS:', err);
    res.status(500).json({ error: err.message || 'TTS failed' });
  }
});

// Speech to Text using ElevenLabs
router.post('/stt', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Expect audio as base64 string in JSON body (no multipart/form-data needed)
    if (!req.body || !req.body.audio) {
      return res.status(400).json({ error: 'Audio data is required. Send as base64 string in "audio" field.' });
    }

    let audioBuffer: Buffer;
    let mimeType = req.body.mimeType || 'audio/webm';

    // Parse base64 audio data
    if (typeof req.body.audio === 'string') {
      if (req.body.audio.startsWith('data:')) {
        // Data URL format: data:audio/webm;base64,...
        const matches = req.body.audio.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          audioBuffer = Buffer.from(matches[2], 'base64');
        } else {
          return res.status(400).json({ error: 'Invalid audio data format' });
        }
      } else {
        // Plain base64 string
        audioBuffer = Buffer.from(req.body.audio, 'base64');
      }
    } else {
      return res.status(400).json({ error: 'Audio must be a base64 string' });
    }

    const transcript = await speechToText(audioBuffer, mimeType);

    if (!transcript) {
      return res.status(503).json({ 
        error: 'STT service unavailable. Please check ELEVENLABS_API_KEY configuration.' 
      });
    }

    res.json({ 
      text: transcript,
      success: true,
    });
  } catch (err: any) {
    console.error('Error in STT:', err);
    res.status(500).json({ error: err.message || 'STT failed' });
  }
});

export default router;
