import { useCallback, useRef, useState } from 'react';

interface VoiceRecorderState {
  isRecording: boolean;
  elapsedMs: number;
  error: string | null;
}

interface UseVoiceRecorderReturn extends VoiceRecorderState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  getChunks: () => Blob[];
}

/**
 * Hook that wraps the browser MediaRecorder API for voice capture.
 * Records audio as WebM/Opus chunks for periodic upload.
 */
export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceRecorderState>({
    isRecording: false,
    elapsedMs: 0,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      setState({ isRecording: false, elapsedMs: 0, error: null });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      });
      streamRef.current = stream;

      // Prefer WebM/Opus, fall back to whatever the browser supports
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setState((prev) => ({ ...prev, error: 'Recording error occurred', isRecording: false }));
        cleanup();
      };

      mediaRecorderRef.current = recorder;

      // Request data every 30 seconds for chunked upload
      recorder.start(30_000);
      startTimeRef.current = Date.now();

      // Update elapsed time every second
      timerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          elapsedMs: Date.now() - startTimeRef.current,
        }));
      }, 1000);

      setState({ isRecording: true, elapsedMs: 0, error: null });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access to give voice feedback.'
          : 'Could not start recording. Please check your microphone.';

      setState({ isRecording: false, elapsedMs: 0, error: message });
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      setState((prev) => ({ ...prev, isRecording: false }));
      return null;
    }

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType;
        const fullBlob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        setState((prev) => ({ ...prev, isRecording: false }));
        resolve(fullBlob);
      };

      recorder.stop();
    });
  }, [cleanup]);

  const getChunks = useCallback((): Blob[] => {
    return [...chunksRef.current];
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    getChunks,
  };
}
