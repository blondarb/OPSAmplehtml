'use client'

/**
 * useVoiceProviderPreference
 *
 * Resolves + persists the user's preferred voice provider for the AI Historian.
 *
 * Priority (highest → lowest):
 *   1. URL query param  ?voice=nova|openai  (useful for PO A/B links)
 *   2. localStorage['voiceProvider']        (survives page reloads)
 *   3. Hard default: 'openai' — matches today's production default; Nova
 *      only engages via an explicit link or toggle interaction.
 *
 * SSR-safe: initializes to 'openai' on the server / first render to avoid
 * hydration mismatch. Reads localStorage and the URL query in a useEffect
 * so the value is resolved only on the client after mount.
 */

import { useState, useEffect, useCallback } from 'react'

type VoiceProviderKind = 'nova' | 'openai'

const STORAGE_KEY = 'voiceProvider'
const VALID: VoiceProviderKind[] = ['nova', 'openai']

function isValid(v: unknown): v is VoiceProviderKind {
  return typeof v === 'string' && (VALID as string[]).includes(v)
}

/**
 * Reads the resolved preference from the browser environment.
 * Must only be called client-side (inside useEffect or event handlers).
 */
function resolveClientPreference(): VoiceProviderKind {
  // 1. URL query param wins — useful for PO A/B link sharing. Note: this is
  //    re-evaluated on every mount, so a `?voice=` link keeps overriding a
  //    toggled-then-stored preference until the param is removed from the URL.
  //    Intentional: an explicit A/B link should pin the engine for that link.
  try {
    const params = new URLSearchParams(window.location.search)
    const urlVal = params.get('voice')
    if (isValid(urlVal)) return urlVal
  } catch {
    // window not available (SSR guard belt-and-suspenders)
  }

  // 2. localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isValid(stored)) return stored
  } catch {
    // Private browsing / storage disabled
  }

  // 3. Default — OpenAI. Nova only ever engages via an explicit ?voice=nova
  // link or a prior toggle interaction; a bare page load must reproduce
  // today's OpenAI-only behavior exactly.
  return 'openai'
}

export function useVoiceProviderPreference(): [
  VoiceProviderKind,
  (p: VoiceProviderKind) => void,
] {
  // Initialize to 'openai' for SSR — overridden in useEffect after mount.
  const [provider, setProviderState] = useState<VoiceProviderKind>('openai')

  // Resolve the real preference once we're on the client.
  useEffect(() => {
    const resolved = resolveClientPreference()
    setProviderState(resolved)
  }, [])

  const setProvider = useCallback((p: VoiceProviderKind) => {
    setProviderState(p)
    try {
      localStorage.setItem(STORAGE_KEY, p)
    } catch {
      // Private browsing / storage quota — preference won't persist, but the
      // in-memory state still governs the current session.
    }
  }, [])

  return [provider, setProvider]
}
