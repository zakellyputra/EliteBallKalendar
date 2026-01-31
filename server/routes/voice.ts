import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { textToSpeech } from '../lib/elevenlabs';

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

// Speech to Text (using browser's SpeechRecognition on frontend)
// This endpoint can be used for server-side STT if needed in the future
router.post('/stt', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // For hackathon MVP, we use browser's native SpeechRecognition API
    // This endpoint is a placeholder for future server-side STT implementation
    
    res.json({ 
      message: 'Use browser SpeechRecognition API for speech input',
      supported: true,
    });
  } catch (err: any) {
    console.error('Error in STT:', err);
    res.status(500).json({ error: err.message || 'STT failed' });
  }
});

export default router;
