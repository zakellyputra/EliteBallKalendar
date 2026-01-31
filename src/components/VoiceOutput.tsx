import { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { voice } from '../lib/api';

interface VoiceOutputProps {
  text: string;
  disabled?: boolean;
}

export function VoiceOutput({ text, disabled }: VoiceOutputProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const audioBlob = await voice.tts(text);
      
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('No audio received');
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      audioRef.current = new Audio(audioUrl);
      
      audioRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audioRef.current.onerror = () => {
        setError('Failed to play audio');
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err: any) {
      console.error('TTS error:', err);
      setError(err.message || 'TTS failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePlay}
      disabled={disabled || isLoading || !text}
      className="gap-2"
      title={error || 'Listen to voice summary'}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : isPlaying ? (
        <>
          <VolumeX className="h-4 w-4" />
          Stop
        </>
      ) : (
        <>
          <Volume2 className="h-4 w-4" />
          Voice Summary
        </>
      )}
    </Button>
  );
}
