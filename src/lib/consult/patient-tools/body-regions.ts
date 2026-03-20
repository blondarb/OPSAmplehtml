/**
 * SVG path definitions for the interactive body map.
 *
 * The body outline is a simplified anterior view at 200×440 viewport.
 * Each region is a closed path with a center point for marker placement.
 */

import type { BodyRegionMeta } from './patient-tools-types'

export const BODY_REGIONS: BodyRegionMeta[] = [
  // ── Head & Neck ─────────────────────────────────────────────────────────────
  {
    id: 'head',
    label: 'Head',
    laterality: 'midline',
    path: 'M85,10 Q100,0 115,10 Q130,25 130,45 Q130,60 115,70 Q100,75 85,70 Q70,60 70,45 Q70,25 85,10 Z',
    center: { x: 100, y: 40 },
  },
  {
    id: 'face_left',
    label: 'Face (Left)',
    laterality: 'left',
    path: 'M85,30 L100,30 L100,65 L85,62 Q75,55 75,45 Q75,35 85,30 Z',
    center: { x: 87, y: 48 },
  },
  {
    id: 'face_right',
    label: 'Face (Right)',
    laterality: 'right',
    path: 'M100,30 L115,30 Q125,35 125,45 Q125,55 115,62 L100,65 L100,30 Z',
    center: { x: 113, y: 48 },
  },
  {
    id: 'neck',
    label: 'Neck',
    laterality: 'midline',
    path: 'M90,70 L110,70 L112,90 L88,90 Z',
    center: { x: 100, y: 80 },
  },

  // ── Torso ───────────────────────────────────────────────────────────────────
  {
    id: 'chest',
    label: 'Chest',
    laterality: 'midline',
    path: 'M65,90 L135,90 L140,140 L60,140 Z',
    center: { x: 100, y: 115 },
  },
  {
    id: 'abdomen',
    label: 'Abdomen',
    laterality: 'midline',
    path: 'M60,140 L140,140 L135,200 L65,200 Z',
    center: { x: 100, y: 170 },
  },

  // ── Shoulders ───────────────────────────────────────────────────────────────
  {
    id: 'shoulder_left',
    label: 'Shoulder (Left)',
    laterality: 'left',
    path: 'M50,90 L65,90 L60,115 L42,110 Z',
    center: { x: 54, y: 100 },
  },
  {
    id: 'shoulder_right',
    label: 'Shoulder (Right)',
    laterality: 'right',
    path: 'M135,90 L150,90 L158,110 L140,115 Z',
    center: { x: 146, y: 100 },
  },

  // ── Upper Arms ──────────────────────────────────────────────────────────────
  {
    id: 'upper_arm_left',
    label: 'Upper Arm (Left)',
    laterality: 'left',
    path: 'M42,110 L60,115 L55,170 L35,165 Z',
    center: { x: 48, y: 140 },
  },
  {
    id: 'upper_arm_right',
    label: 'Upper Arm (Right)',
    laterality: 'right',
    path: 'M140,115 L158,110 L165,165 L145,170 Z',
    center: { x: 152, y: 140 },
  },

  // ── Forearms ────────────────────────────────────────────────────────────────
  {
    id: 'forearm_left',
    label: 'Forearm (Left)',
    laterality: 'left',
    path: 'M35,165 L55,170 L48,225 L28,220 Z',
    center: { x: 42, y: 195 },
  },
  {
    id: 'forearm_right',
    label: 'Forearm (Right)',
    laterality: 'right',
    path: 'M145,170 L165,165 L172,220 L152,225 Z',
    center: { x: 158, y: 195 },
  },

  // ── Hands ───────────────────────────────────────────────────────────────────
  {
    id: 'hand_left',
    label: 'Hand (Left)',
    laterality: 'left',
    path: 'M28,220 L48,225 L45,255 L22,250 Z',
    center: { x: 36, y: 238 },
  },
  {
    id: 'hand_right',
    label: 'Hand (Right)',
    laterality: 'right',
    path: 'M152,225 L172,220 L178,250 L155,255 Z',
    center: { x: 164, y: 238 },
  },

  // ── Hips ────────────────────────────────────────────────────────────────────
  {
    id: 'hip_left',
    label: 'Hip (Left)',
    laterality: 'left',
    path: 'M65,200 L100,200 L95,230 L68,228 Z',
    center: { x: 82, y: 215 },
  },
  {
    id: 'hip_right',
    label: 'Hip (Right)',
    laterality: 'right',
    path: 'M100,200 L135,200 L132,228 L105,230 Z',
    center: { x: 118, y: 215 },
  },

  // ── Thighs ──────────────────────────────────────────────────────────────────
  {
    id: 'thigh_left',
    label: 'Thigh (Left)',
    laterality: 'left',
    path: 'M68,228 L95,230 L90,305 L72,305 Z',
    center: { x: 81, y: 268 },
  },
  {
    id: 'thigh_right',
    label: 'Thigh (Right)',
    laterality: 'right',
    path: 'M105,230 L132,228 L128,305 L110,305 Z',
    center: { x: 119, y: 268 },
  },

  // ── Knees ───────────────────────────────────────────────────────────────────
  {
    id: 'knee_left',
    label: 'Knee (Left)',
    laterality: 'left',
    path: 'M72,305 L90,305 L88,330 L70,330 Z',
    center: { x: 80, y: 318 },
  },
  {
    id: 'knee_right',
    label: 'Knee (Right)',
    laterality: 'right',
    path: 'M110,305 L128,305 L130,330 L112,330 Z',
    center: { x: 120, y: 318 },
  },

  // ── Calves ──────────────────────────────────────────────────────────────────
  {
    id: 'calf_left',
    label: 'Calf (Left)',
    laterality: 'left',
    path: 'M70,330 L88,330 L86,395 L73,395 Z',
    center: { x: 79, y: 363 },
  },
  {
    id: 'calf_right',
    label: 'Calf (Right)',
    laterality: 'right',
    path: 'M112,330 L130,330 L127,395 L114,395 Z',
    center: { x: 121, y: 363 },
  },

  // ── Feet ────────────────────────────────────────────────────────────────────
  {
    id: 'foot_left',
    label: 'Foot (Left)',
    laterality: 'left',
    path: 'M73,395 L86,395 L88,425 L68,425 Z',
    center: { x: 79, y: 410 },
  },
  {
    id: 'foot_right',
    label: 'Foot (Right)',
    laterality: 'right',
    path: 'M114,395 L127,395 L132,425 L112,425 Z',
    center: { x: 121, y: 410 },
  },

  // ── Back (separate layer, toggled by view switch) ───────────────────────────
  {
    id: 'upper_back',
    label: 'Upper Back',
    laterality: 'midline',
    path: 'M65,90 L135,90 L140,140 L60,140 Z',
    center: { x: 100, y: 115 },
  },
  {
    id: 'lower_back',
    label: 'Lower Back',
    laterality: 'midline',
    path: 'M60,140 L140,140 L135,200 L65,200 Z',
    center: { x: 100, y: 170 },
  },
]

/** Front-view regions (default). */
export const FRONT_REGIONS = BODY_REGIONS.filter(
  (r) => r.id !== 'upper_back' && r.id !== 'lower_back',
)

/** Back-view regions (toggled). Reuses torso paths but different semantic meaning. */
export const BACK_REGIONS = BODY_REGIONS.filter(
  (r) =>
    r.id === 'upper_back' ||
    r.id === 'lower_back' ||
    r.id === 'head' ||
    r.id === 'neck' ||
    r.id.startsWith('shoulder') ||
    r.id.startsWith('upper_arm') ||
    r.id.startsWith('forearm') ||
    r.id.startsWith('hand') ||
    r.id.startsWith('hip') ||
    r.id.startsWith('thigh') ||
    r.id.startsWith('knee') ||
    r.id.startsWith('calf') ||
    r.id.startsWith('foot'),
)

export const SYMPTOM_COLORS: Record<string, string> = {
  pain: '#EF4444',       // red
  numbness: '#3B82F6',   // blue
  tingling: '#F59E0B',   // amber
  weakness: '#8B5CF6',   // purple
  stiffness: '#06B6D4',  // cyan
  spasm: '#EC4899',      // pink
}

export const SYMPTOM_LABELS: Record<string, string> = {
  pain: 'Pain',
  numbness: 'Numbness',
  tingling: 'Tingling',
  weakness: 'Weakness',
  stiffness: 'Stiffness',
  spasm: 'Spasm / Cramping',
}
