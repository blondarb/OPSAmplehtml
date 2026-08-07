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
    // Re-enabled 2026-08-06 once the paragraph that tripped Bedrock's content
    // filter was reworded and re-verified against the live relay. Assert the
    // ACTIVE code (comment lines stripped), so a commented-out fallback can
    // never satisfy this the way it did during the revert.
    const active = route
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(active).toContain('referralFocus = referralReason.trim()')
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

/**
 * The REFERRAL-DIRECTED block passes Bedrock's content filter. That is a
 * property of its WORDING, and it is not obvious from reading it.
 *
 * 2026-08-06: the block's "if the patient asks why they were referred"
 * paragraph read "Answer them — do not deflect this to the neurologist,
 * because it is a question about their own record, not a request for medical
 * advice." Bedrock rejected it, so every Nova voice session carrying the block
 * died before the model spoke and the UI sat on "Waiting for the first
 * question...". Bisected against the live relay: the other five paragraphs
 * each pass alone; only this one blocked. It is NOT the phrase "medical
 * advice" — deleting that clause still blocked, and swapping in "clinical
 * guidance" still blocked. The trigger is the "do not deflect this to the
 * neurologist" construction, which reads as an instruction to override
 * clinical deferral.
 *
 * These assertions cannot call Bedrock, so they pin the known-bad shape
 * instead. If you need to change this paragraph, re-verify against the relay.
 */
describe('the referral-directed block keeps its filter-safe wording', () => {
  const prompt = buildHistorianSystemPrompt(
    'new_patient',
    'Persistent headaches',
    undefined,
    undefined,
    'Persistent headaches',
  )

  it('does not reintroduce the construction Bedrock rejected', () => {
    expect(
      prompt.includes('do not deflect this to the'),
      'this phrasing was BLOCKED by Bedrock and silenced every Nova session — ' +
        're-verify against the relay before reinstating it',
    ).toBe(false)
  })

  it('still tells the model to answer the question rather than defer it', () => {
    // The clinical intent must survive the rewording — Steve asked for this
    // behaviour explicitly ("the historian could even say 'you were sent to
    // the neurologist to discuss...'").
    expect(prompt).toContain('IF THE PATIENT ASKS WHY THEY WERE REFERRED')
    expect(prompt).toContain('answer it directly')
  })

  it('keeps the safety carve-outs that must never be traded away', () => {
    expect(prompt).toContain('Never trade a safety question for')
    expect(prompt).toContain('not a confirmed diagnosis')
  })
})
