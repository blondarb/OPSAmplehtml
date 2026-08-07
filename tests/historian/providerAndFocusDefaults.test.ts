import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildHistorianSystemPrompt } from '@/lib/historianPrompts'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/**
 * Two defects found live on 2026-08-06, both caused by a client-side default
 * silently overriding a server-side one.
 *
 * 1. VOICE_PROVIDER was inert. The session route resolves
 *    `body.provider ?? process.env.VOICE_PROVIDER ?? 'openai'`, but the client
 *    ALWAYS sent `provider`, defaulting to 'openai'. So the env var could never
 *    be reached and setting VOICE_PROVIDER=nova changed nothing — the historian
 *    kept using OpenAI, which was out of credits, and sat silent.
 *
 * 2. A canned demo scenario never led with the referral reason. The
 *    REFERRAL-DIRECTED PRIORITY block is gated on `referralFocus`, which only a
 *    triage handoff or pasted referral produced. A patient who said "I don't
 *    know why I'm here" was never told.
 */

describe('the client must not shadow the server voice-provider default', () => {
  for (const path of [
    'src/components/NeurologicHistorian.tsx',
    'src/components/consult/EmbeddedHistorian.tsx',
  ]) {
    it(`${path} sends provider ONLY when explicitly chosen`, () => {
      const source = read(path)
      expect(
        source.includes('voiceProviderExplicit ? voiceProvider : undefined'),
        `${path} must omit \`provider\` unless the user picked one, otherwise ` +
          `process.env.VOICE_PROVIDER can never be reached.`,
      ).toBe(true)
      // The unconditional form is what caused the outage.
      expect(source).not.toContain('provider: voiceProvider,')
    })
  }

  it('the preference hook reports whether the choice was explicit', () => {
    const source = read('src/lib/voice/useVoiceProviderPreference.ts')
    expect(source).toContain('explicit: false')
    expect(source).toContain('explicit: true')
  })

  it('the route still prefers an explicit client choice over the env default', () => {
    // ?voice=nova A/B links must keep working — the fix is about the ABSENCE
    // of a choice, not about ignoring one.
    const route = read('src/app/api/ai/historian/session/route.ts')
    expect(route).toContain("body.provider ?? process.env.VOICE_PROVIDER ?? 'openai'")
  })
})

describe('a canned scenario leads with its referral reason', () => {
  it('the route falls back to referralReason when no richer focus exists', () => {
    const route = read('src/app/api/ai/historian/session/route.ts')
    // REVERTED 2026-08-06. The fallback is disabled because the block it
    // enables is rejected by Bedrock's content filter, which killed every Nova
    // voice session it touched. Asserting the code string here would now pass
    // against the COMMENTED-OUT line — a test that cannot fail. Assert the
    // disable instead, and why, so re-enabling it is a deliberate act that has
    // to update this test.
    const active = route
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(
      active.includes('referralFocus = referralReason.trim()'),
      'the referralReason fallback must stay disabled until the ' +
        'REFERRAL-DIRECTED block is reworded past the Bedrock content filter',
    ).toBe(false)
    expect(route).toContain('BLOCKED BY BEDROCK')
  })

  it('a referralFocus actually produces the directive block', () => {
    const withFocus = buildHistorianSystemPrompt(
      'new_patient',
      'Persistent headaches',
      undefined,
      undefined,
      'Persistent headaches',
    )
    expect(withFocus).toContain('REFERRAL-DIRECTED PRIORITY')
    expect(withFocus).toContain('Persistent headaches')
  })

  it('no focus still produces a valid prompt without the directive block', () => {
    // The fallback must not become mandatory — a real-patient session with no
    // referral at all still has to work.
    const noFocus = buildHistorianSystemPrompt('new_patient', undefined, undefined, undefined, null)
    expect(noFocus).not.toContain('REFERRAL-DIRECTED PRIORITY')
    expect(noFocus.length).toBeGreaterThan(100)
  })
})
