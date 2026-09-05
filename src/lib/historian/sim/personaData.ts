/**
 * Bundled persona fixtures for the DEPLOYED runtime.
 *
 * The persona JSONs live under tests/simulated-patients/personas/ and are read
 * from disk by personaFixtures.ts — which is fine for the CLI harness and unit
 * tests, but Amplify SSR does NOT deploy the tests/ directory, so those fs
 * reads find nothing in production (symptom: "No personas available to run" on
 * /rnd/historian/simulator).
 *
 * Importing the JSON statically here bundles it into the serverless output, so
 * the sim API routes (persona list, patient-turn, score) work in production.
 * personaFixtures.ts falls back to this set when its fs read fails, keeping a
 * single source of truth (these imports point AT the same fixture files).
 */

import acuteStroke from '../../../../tests/simulated-patients/personas/acute-stroke.json'
import firstSeizure from '../../../../tests/simulated-patients/personas/first-seizure.json'
import migraineChronic from '../../../../tests/simulated-patients/personas/migraine-chronic.json'
import msRelapse from '../../../../tests/simulated-patients/personas/ms-relapse.json'
import peripheralNeuropathy from '../../../../tests/simulated-patients/personas/peripheral-neuropathy.json'

import seizureBupropionAlcohol from '../../../../tests/simulated-patients/personas/seizure-bupropion-alcohol.json'

export const BUNDLED_PERSONAS: Record<string, unknown> = {
  'seizure-bupropion-alcohol': seizureBupropionAlcohol,
  'acute-stroke': acuteStroke,
  'first-seizure': firstSeizure,
  'migraine-chronic': migraineChronic,
  'ms-relapse': msRelapse,
  'peripheral-neuropathy': peripheralNeuropathy,
}

export function listBundledPersonaIds(): string[] {
  return Object.keys(BUNDLED_PERSONAS).sort()
}

export function getBundledPersona(personaFile: string): unknown | null {
  const key = personaFile.replace(/\.json$/, '')
  return BUNDLED_PERSONAS[key] ?? null
}
