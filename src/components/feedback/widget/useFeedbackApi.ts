import { useCallback, useRef } from 'react';
import type { FeedbackCategory, FeedbackEvent } from './types';

interface CreateSessionResponse {
  sessionId: string;
  audioUploadUrl: string;
}

interface UseFeedbackApiReturn {
  createSession: (appId: string, user?: { id: string; label: string }) => Promise<string>;
  uploadAudio: (blob: Blob) => Promise<void>;
  submitSession: (data: {
    category: FeedbackCategory;
    events: FeedbackEvent[];
    duration: number;
  }) => Promise<void>;
  getUploadUrl: (type: 'audio-chunk' | 'screenshot', index: number) => Promise<string>;
}

/**
 * API client hook for the feedback backend.
 * Handles session creation, audio upload via pre-signed S3 URLs, and session finalization.
 */
export function useFeedbackApi(apiUrl: string, apiKey?: string): UseFeedbackApiReturn {
  const sessionIdRef = useRef<string | null>(null);
  const audioUploadUrlRef = useRef<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) h['x-api-key'] = apiKey;
    return h;
  }, [apiKey]);

  const createSession = useCallback(
    async (appId: string, user?: { id: string; label: string }): Promise<string> => {
      const res = await fetch(`${apiUrl}/sessions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          appId,
          userId: user?.id,
          userLabel: user?.label,
          userAgent: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          startedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);

      const data: CreateSessionResponse = await res.json();
      sessionIdRef.current = data.sessionId;
      audioUploadUrlRef.current = data.audioUploadUrl;

      return data.sessionId;
    },
    [apiUrl, headers],
  );

  const uploadAudio = useCallback(async (blob: Blob): Promise<void> => {
    const url = audioUploadUrlRef.current;
    if (!url) throw new Error('No upload URL — create session first');

    // Upload directly to S3 via pre-signed URL
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });

    if (!res.ok) throw new Error(`Failed to upload audio: ${res.status}`);
  }, []);

  const getUploadUrl = useCallback(
    async (type: 'audio-chunk' | 'screenshot', index: number): Promise<string> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) throw new Error('No session — create session first');

      const res = await fetch(`${apiUrl}/sessions/${sessionId}/upload-url`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ type, index }),
      });

      if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);
      const data = await res.json();
      return data.uploadUrl;
    },
    [apiUrl, headers],
  );

  const submitSession = useCallback(
    async (data: {
      category: FeedbackCategory;
      events: FeedbackEvent[];
      duration: number;
    }): Promise<void> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) throw new Error('No session — create session first');

      const res = await fetch(`${apiUrl}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          category: data.category,
          events: data.events,
          duration: data.duration,
          status: 'submitted',
        }),
      });

      if (!res.ok) throw new Error(`Failed to submit session: ${res.status}`);
    },
    [apiUrl, headers],
  );

  return {
    createSession,
    uploadAudio,
    submitSession,
    getUploadUrl,
  };
}
