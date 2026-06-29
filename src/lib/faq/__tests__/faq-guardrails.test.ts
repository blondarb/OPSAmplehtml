/**
 * Tests for the deterministic FAQ safety gates (Gate 0 red-flag + Gate 1
 * out-of-scope). These run with NO model call, so they're the non-bypassable
 * floor of the layered safety design — exactly the layer that must be tested
 * deterministically. See safety_architecture.md §9.
 */

import { describe, it, expect } from 'vitest'
import { checkGuardrails } from '../faq-guardrails'
import { SPECIALTIES } from '../specialty'

const neuro = SPECIALTIES.neuro
const oab = SPECIALTIES.oab

describe('Gate 0 — red-flag intercept (cross-specialty)', () => {
  it('catches self-harm and flags selfHarm', () => {
    const v = checkGuardrails('honestly I want to die', neuro)
    expect(v.kind).toBe('red_flag')
    if (v.kind === 'red_flag') expect(v.selfHarm).toBe(true)
  })

  it('catches generic acute emergencies in any specialty', () => {
    expect(checkGuardrails("I can't breathe", oab).kind).toBe('red_flag')
    expect(checkGuardrails('I have chest pain', neuro).kind).toBe('red_flag')
  })
})

describe('Gate 0 — neuro-specific red flags', () => {
  it.each([
    'is my face drooping a sign of something',
    'my speech is slurred and one side is weak',
    'this is the worst headache of my life',
    "I think I'm having a seizure",
    'am I having a stroke',
  ])('intercepts: %s', (utterance) => {
    expect(checkGuardrails(utterance, neuro).kind).toBe('red_flag')
  })
})

describe('Gate 0 — urology/OAB-specific red flags', () => {
  it.each([
    "I can't urinate at all",
    'there is blood in my urine and clots',
    'I have a fever and flank pain',
  ])('intercepts: %s', (utterance) => {
    expect(checkGuardrails(utterance, oab).kind).toBe('red_flag')
  })
})

describe('Gate 0 — cauda equina (neuro surgical emergency)', () => {
  it.each([
    'I suddenly lost control of my bladder and my back hurts',
    'I have numbness in my groin and saddle area',
    'I cant control my bowels',
  ])('intercepts: %s', (utterance) => {
    expect(checkGuardrails(utterance, neuro).kind).toBe('red_flag')
  })
})

describe('Gate 1 — out-of-scope (clinical judgment) refuses', () => {
  it.each([
    'should I change my dose',
    'can I skip my medication today',
    'should I go to the ER',
    'is this a side effect',
  ])('refuses: %s', (utterance) => {
    expect(checkGuardrails(utterance, neuro).kind).toBe('out_of_scope')
  })
})

describe('Pass-through — benign FAQs reach the model layer', () => {
  it.each([
    ['neuro', 'when can I drive after my craniotomy', neuro],
    ['neuro', 'what does my levetiracetam do', neuro],
    ['oab', 'what is overactive bladder', oab],
    ['oab', 'does caffeine make it worse', oab],
  ] as const)('%s passes: %s', (_label, utterance, cfg) => {
    expect(checkGuardrails(utterance, cfg).kind).toBe('pass')
  })
})

describe('Specialty isolation — a specialty only loads its own red flags', () => {
  it('neuro stroke language is not a neuro-specific *urology* match (but still passes cleanly in oab)', () => {
    // "am I having a stroke" is a neuro red flag; under the oab specialty it has
    // no matching bank, so it should pass deterministic gates (the LLM classifier
    // would still catch it). This documents the seam boundary.
    expect(checkGuardrails('am I having a stroke', oab).kind).toBe('pass')
    expect(checkGuardrails('am I having a stroke', neuro).kind).toBe('red_flag')
  })
})
