import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number;
  startRecording: (meetingId: string) => Promise<void>;
  stopRecording: () => Promise<string | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  error: string | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'checking';
  requestPermissions: () => Promise<boolean>;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meetingIdRef = useRef<string | null>(null);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setPermissionStatus('checking');
      
      // Request microphone permission
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Try to get system audio (display media with audio)
      let systemStream: MediaStream | null = null;
      try {
        systemStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1, height: 1 }, // Minimal video to get audio
          audio: true,
        });
        // Stop the video track immediately, we only need audio
        systemStream.getVideoTracks().forEach(track => track.stop());
      } catch (e) {
        console.log('System audio not available, using microphone only');
      }

      // Combine streams if system audio is available
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      
      // Add microphone audio
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      // Add system audio if available
      if (systemStream && systemStream.getAudioTracks().length > 0) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        systemSource.connect(destination);
      }

      streamRef.current = destination.stream;
      
      // Set up analyser for audio levels
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = 256;
      micSource.connect(analyserRef.current);

      setPermissionStatus('granted');
      return true;
    } catch (err) {
      console.error('Permission error:', err);
      setPermissionStatus('denied');
      setError('Microphone permission denied. Please allow access to record meetings.');
      return false;
    }
  }, []);

  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecording && !isPaused) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [isRecording, isPaused]);

  const startRecording = useCallback(async (meetingId: string) => {
    if (!streamRef.current) {
      const granted = await requestPermissions();
      if (!granted) return;
    }

    if (!streamRef.current) {
      setError('No audio stream available');
      return;
    }

    meetingIdRef.current = meetingId;
    audioChunksRef.current = [];
    setError(null);
    setDuration(0);

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Start audio level monitoring
      updateAudioLevel();

    } catch (err) {
      console.error('Recording error:', err);
      setError('Failed to start recording');
    }
  }, [requestPermissions, updateAudioLevel]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !meetingIdRef.current || !user) {
        resolve(null);
        return;
      }

      const meetingId = meetingIdRef.current;

      mediaRecorderRef.current.onstop = async () => {
        // Stop duration counter
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
        }

        // Stop animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        try {
          // Upload to storage
          const fileName = `${user.id}/${meetingId}/${Date.now()}.webm`;
          const { data, error: uploadError } = await supabase.storage
            .from('recordings')
            .upload(fileName, audioBlob);

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('recordings')
            .getPublicUrl(fileName);

          // Update meeting with audio URL
          await supabase
            .from('meetings')
            .update({ 
              audio_url: fileName,
              end_time: new Date().toISOString(),
              duration_seconds: duration,
              status: 'processing'
            })
            .eq('id', meetingId);

          setIsRecording(false);
          setIsPaused(false);
          setAudioLevel(0);
          resolve(fileName);
        } catch (err) {
          console.error('Upload error:', err);
          setError('Failed to save recording');
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [user, duration]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  }, [isRecording]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      durationIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      updateAudioLevel();
    }
  }, [isPaused, updateAudioLevel]);

  return {
    isRecording,
    isPaused,
    duration,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    error,
    permissionStatus,
    requestPermissions,
  };
}
