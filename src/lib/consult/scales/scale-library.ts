/**
 * Scale Auto-Administration Library (Phase 3)
 *
 * Wraps the existing src/lib/scales/ definitions with:
 *   - Trigger conditions (what the localizer must detect to trigger each scale)
 *   - Admin mode (voice_administrable vs exam_required)
 *   - Conversational question text for natural spoken delivery
 *
 * Also defines NIHSS and ALSFRS-R, which are not in the base scale library.
 */

import type { ScaleDefinition } from '@/lib/scales/types'
import {
  PHQ9,
  GAD7,
  MIDAS,
  HIT6,
  MOCA,
  ESS,
} from '@/lib/scales/scale-definitions'
import type {
  ScaleTrigger,
  ScaleAdministrationQuestion,
  ScaleAdminMode,
} from './scale-types'

// ─── Supplementary scale definitions ─────────────────────────────────────────
// NIHSS and ALSFRS-R are not in the base library; defined here for the consult pipeline.

/**
 * NIH Stroke Scale (NIHSS) — 15 items, range 0–42.
 * Requires physician examination. Marked exam_required; not voice-administered.
 * Source: Brott T, et al. Measurements of acute cerebral infarction. Stroke. 1989.
 */
export const NIHSS: ScaleDefinition = {
  id: 'nihss',
  name: 'NIH Stroke Scale',
  abbreviation: 'NIHSS',
  description: 'Quantifies stroke severity across 15 neurological domains. Requires clinician administration.',
  category: 'other',
  timeToComplete: 10,
  source: 'Brott T, et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke. 1989;20(7):864–70.',
  scoringMethod: 'sum',
  questions: [
    {
      id: '1a',
      text: '1a. Level of Consciousness',
      type: 'select',
      required: true,
      helpText: 'Assign grade even if full evaluation is prevented by intubation, language barrier, or orotracheal intubation',
      options: [
        { value: 0, label: '0 — Alert; keenly responsive' },
        { value: 1, label: '1 — Not alert; arousable by minor stimulation' },
        { value: 2, label: '2 — Not alert; requires repeated stimulation' },
        { value: 3, label: '3 — Unresponsive or responds only with reflex' },
      ],
    },
    {
      id: '1b',
      text: '1b. LOC Questions (month, age)',
      type: 'select',
      required: true,
      helpText: 'Ask current month and patient\'s age. Score based on correct answers only.',
      options: [
        { value: 0, label: '0 — Answers both correctly' },
        { value: 1, label: '1 — Answers one correctly' },
        { value: 2, label: '2 — Answers neither correctly' },
      ],
    },
    {
      id: '1c',
      text: '1c. LOC Commands (open/close eyes, grip/release hand)',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — Performs both tasks correctly' },
        { value: 1, label: '1 — Performs one task correctly' },
        { value: 2, label: '2 — Performs neither task correctly' },
      ],
    },
    {
      id: '2',
      text: '2. Best Gaze (horizontal eye movement)',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — Normal' },
        { value: 1, label: '1 — Partial gaze palsy' },
        { value: 2, label: '2 — Forced deviation or total gaze paresis' },
      ],
    },
    {
      id: '3',
      text: '3. Visual Fields',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — No visual loss' },
        { value: 1, label: '1 — Partial hemianopia' },
        { value: 2, label: '2 — Complete hemianopia' },
        { value: 3, label: '3 — Bilateral hemianopia (blind including cortical blindness)' },
      ],
    },
    {
      id: '4',
      text: '4. Facial Palsy',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — Normal symmetrical movements' },
        { value: 1, label: '1 — Minor paralysis (flattened NLF, asymmetry on smiling)' },
        { value: 2, label: '2 — Partial paralysis (total or near-total lower face)' },
        { value: 3, label: '3 — Complete paralysis (absence of facial movement, upper and lower face)' },
      ],
    },
    {
      id: '5a',
      text: '5a. Motor Arm — Left',
      type: 'select',
      required: true,
      helpText: 'Extend arm 90° (if sitting) or 45° (if supine). Count drift for 10 seconds.',
      options: [
        { value: 0, label: '0 — No drift' },
        { value: 1, label: '1 — Drift; limb holds 90° (or 45°), but drifts before 10 seconds' },
        { value: 2, label: '2 — Some effort against gravity; limb cannot get to 90° (or 45°)' },
        { value: 3, label: '3 — No effort against gravity; limb falls' },
        { value: 4, label: '4 — No movement' },
      ],
    },
    {
      id: '5b',
      text: '5b. Motor Arm — Right',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — No drift' },
        { value: 1, label: '1 — Drift before 10 seconds' },
        { value: 2, label: '2 — Some effort against gravity' },
        { value: 3, label: '3 — No effort against gravity' },
        { value: 4, label: '4 — No movement' },
      ],
    },
    {
      id: '6a',
      text: '6a. Motor Leg — Left',
      type: 'select',
      required: true,
      helpText: 'Hold leg at 30° (supine). Count drift for 5 seconds.',
      options: [
        { value: 0, label: '0 — No drift for 5 seconds' },
        { value: 1, label: '1 — Drifts by end of 5 seconds but not to bed' },
        { value: 2, label: '2 — Some effort against gravity; falls to bed before 5 seconds' },
        { value: 3, label: '3 — No effort against gravity; falls immediately' },
        { value: 4, label: '4 — No movement' },
      ],
    },
    {
      id: '6b',
      text: '6b. Motor Leg — Right',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — No drift for 5 seconds' },
        { value: 1, label: '1 — Drifts by end of 5 seconds' },
        { value: 2, label: '2 — Some effort against gravity' },
        { value: 3, label: '3 — No effort against gravity' },
        { value: 4, label: '4 — No movement' },
      ],
    },
    {
      id: '7',
      text: '7. Limb Ataxia',
      type: 'select',
      required: true,
      helpText: 'Finger-nose and heel-shin tests. Scored only if out of proportion to weakness.',
      options: [
        { value: 0, label: '0 — Absent' },
        { value: 1, label: '1 — Present in one limb' },
        { value: 2, label: '2 — Present in two limbs' },
      ],
    },
    {
      id: '8',
      text: '8. Sensory',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — Normal; no sensory loss' },
        { value: 1, label: '1 — Mild to moderate sensory loss; patient feels pinprick but less sharp on affected side' },
        { value: 2, label: '2 — Severe to total sensory loss; patient is not aware of being touched' },
      ],
    },
    {
      id: '9',
      text: '9. Best Language',
      type: 'select',
      required: true,
      helpText: 'Name items, describe picture, read sentences.',
      options: [
        { value: 0, label: '0 — No aphasia; normal' },
        { value: 1, label: '1 — Mild to moderate aphasia' },
        { value: 2, label: '2 — Severe aphasia; fragmentary expression' },
        { value: 3, label: '3 — Mute, global aphasia; no usable speech or auditory comprehension' },
      ],
    },
    {
      id: '10',
      text: '10. Dysarthria',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — Normal' },
        { value: 1, label: '1 — Mild to moderate dysarthria; patient slurs at least some words' },
        { value: 2, label: '2 — Severe dysarthria; patient\'s speech is so slurred as to be unintelligible' },
      ],
    },
    {
      id: '11',
      text: '11. Extinction and Inattention (Neglect)',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 — No abnormality' },
        { value: 1, label: '1 — Visual, tactile, auditory, spatial, or personal inattention' },
        { value: 2, label: '2 — Profound hemi-inattention or extinction to more than one modality' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 0, interpretation: 'No stroke symptoms', severity: 'minimal' },
    { min: 1, max: 4, interpretation: 'Minor stroke', severity: 'mild' },
    { min: 5, max: 15, interpretation: 'Moderate stroke', severity: 'moderate' },
    { min: 16, max: 20, interpretation: 'Moderate to severe stroke', severity: 'moderately_severe' },
    { min: 21, max: 42, interpretation: 'Severe stroke', severity: 'severe' },
  ],
  alerts: [
    {
      id: 'nihss-severe',
      condition: 'score >= 21',
      type: 'critical',
      message: 'Severe stroke (NIHSS ≥ 21). Consider comprehensive stroke center evaluation.',
      action: 'Emergent neurology/neurosurgery consult',
    },
    {
      id: 'nihss-tpa-window',
      condition: 'score >= 4',
      type: 'warning',
      message: 'Patient may be eligible for thrombolysis. Confirm symptom onset time and exclusion criteria.',
    },
  ],
}

/**
 * ALS Functional Rating Scale — Revised (ALSFRS-R) — 12 items, range 0–48.
 * Patient-reported; administered verbally by the historian AI.
 * Source: Cedarbaum JM, et al. The ALSFRS-R. J Neurol Sci. 1999.
 */
export const ALSFRS_R: ScaleDefinition = {
  id: 'alsfrs_r',
  name: 'ALS Functional Rating Scale — Revised',
  abbreviation: 'ALSFRS-R',
  description: 'Assesses functional status across 12 domains in ALS patients. Higher scores = better function.',
  category: 'functional',
  timeToComplete: 10,
  source: 'Cedarbaum JM, et al. The ALSFRS-R: a revised ALS functional rating scale that incorporates assessments of respiratory function. J Neurol Sci. 1999;169(1–2):13–21.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'q1',
      text: 'Speech',
      type: 'select',
      required: true,
      helpText: 'Rate current speech function',
      options: [
        { value: 4, label: '4 — Normal speech process' },
        { value: 3, label: '3 — Detectable speech disturbance' },
        { value: 2, label: '2 — Intelligible with repeating' },
        { value: 1, label: '1 — Speech combined with non-vocal communication' },
        { value: 0, label: '0 — Loss of useful speech' },
      ],
    },
    {
      id: 'q2',
      text: 'Salivation',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal' },
        { value: 3, label: '3 — Slight but definite excess of saliva in mouth; may have nighttime drooling' },
        { value: 2, label: '2 — Moderately excessive saliva; may have minimal drooling' },
        { value: 1, label: '1 — Marked excess of saliva with some drooling' },
        { value: 0, label: '0 — Marked drooling; requires constant tissue or handkerchief' },
      ],
    },
    {
      id: 'q3',
      text: 'Swallowing',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal eating habits' },
        { value: 3, label: '3 — Early eating problems; occasional choking' },
        { value: 2, label: '2 — Dietary consistency changes' },
        { value: 1, label: '1 — Needs supplemental tube feeding' },
        { value: 0, label: '0 — NPO (exclusively parenteral or enteral feeding)' },
      ],
    },
    {
      id: 'q4',
      text: 'Handwriting',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal' },
        { value: 3, label: '3 — Slow or sloppy; all words are legible' },
        { value: 2, label: '2 — Not all words are legible' },
        { value: 1, label: '1 — Able to grip pen but unable to write' },
        { value: 0, label: '0 — Unable to grip pen' },
      ],
    },
    {
      id: 'q5',
      text: 'Cutting Food and Handling Utensils',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal' },
        { value: 3, label: '3 — Somewhat slow and clumsy, but no help needed' },
        { value: 2, label: '2 — Can cut most foods, although clumsy and slow; some help needed' },
        { value: 1, label: '1 — Food must be cut by someone, but can still feed self' },
        { value: 0, label: '0 — Needs to be fed' },
      ],
    },
    {
      id: 'q6',
      text: 'Dressing and Hygiene',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal function' },
        { value: 3, label: '3 — Independent and complete self-care with effort or decreased efficiency' },
        { value: 2, label: '2 — Intermittent assistance or substitute methods' },
        { value: 1, label: '1 — Needs attendant for self-care' },
        { value: 0, label: '0 — Total dependence' },
      ],
    },
    {
      id: 'q7',
      text: 'Turning in Bed and Adjusting Bed Clothes',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal' },
        { value: 3, label: '3 — Somewhat slow and clumsy, but no help needed' },
        { value: 2, label: '2 — Can turn alone or adjust sheets, but with great difficulty' },
        { value: 1, label: '1 — Can initiate but not turn or adjust sheets alone' },
        { value: 0, label: '0 — Helpless' },
      ],
    },
    {
      id: 'q8',
      text: 'Walking',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal' },
        { value: 3, label: '3 — Early ambulation difficulties' },
        { value: 2, label: '2 — Walks with assistance' },
        { value: 1, label: '1 — Non-ambulatory functional movement only' },
        { value: 0, label: '0 — No purposeful leg movement' },
      ],
    },
    {
      id: 'q9',
      text: 'Climbing Stairs',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — Normal' },
        { value: 3, label: '3 — Slow' },
        { value: 2, label: '2 — Mild unsteadiness or fatigue' },
        { value: 1, label: '1 — Needs assistance' },
        { value: 0, label: '0 — Cannot do' },
      ],
    },
    {
      id: 'q10',
      text: 'Dyspnea',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — None' },
        { value: 3, label: '3 — Occurs when walking' },
        { value: 2, label: '2 — Occurs with one or more of the following: eating, bathing, dressing' },
        { value: 1, label: '1 — Occurs at rest, difficulty breathing when either sitting or lying' },
        { value: 0, label: '0 — Significant difficulty, considering using mechanical respiratory support' },
      ],
    },
    {
      id: 'q11',
      text: 'Orthopnea',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — None' },
        { value: 3, label: '3 — Some difficulty sleeping at night due to shortness of breath; does not routinely use more than 2 pillows' },
        { value: 2, label: '2 — Needs extra pillows in order to sleep (more than 2)' },
        { value: 1, label: '1 — Can only sleep sitting up' },
        { value: 0, label: '0 — Unable to sleep' },
      ],
    },
    {
      id: 'q12',
      text: 'Respiratory Insufficiency',
      type: 'select',
      required: true,
      options: [
        { value: 4, label: '4 — None' },
        { value: 3, label: '3 — Intermittent use of BiPAP' },
        { value: 2, label: '2 — Continuous use of BiPAP during the night' },
        { value: 1, label: '1 — Continuous use of BiPAP during night and day' },
        { value: 0, label: '0 — Invasive mechanical ventilation by intubation or tracheostomy' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 20, interpretation: 'Severe functional impairment', severity: 'severe' },
    { min: 21, max: 30, interpretation: 'Moderately severe functional impairment', severity: 'moderately_severe' },
    { min: 31, max: 38, interpretation: 'Moderate functional impairment', severity: 'moderate' },
    { min: 39, max: 44, interpretation: 'Mild functional impairment', severity: 'mild' },
    { min: 45, max: 48, interpretation: 'Minimal functional impairment', severity: 'minimal' },
  ],
}

// ─── Conversational question maps ────────────────────────────────────────────
// Natural spoken versions of each scale's questions for voice administration.

const PHQ9_CONVERSATIONAL: Record<string, string> = {
  q1: 'Over the last two weeks, how often have you had little interest or pleasure in doing things? Would you say not at all, several days, more than half the days, or nearly every day?',
  q2: 'Over the last two weeks, how often have you felt down, depressed, or hopeless?',
  q3: 'Over the last two weeks, how often have you had trouble falling or staying asleep, or sleeping too much?',
  q4: 'How often have you felt tired or had little energy?',
  q5: 'How often have you had poor appetite, or found yourself overeating?',
  q6: 'How often have you felt bad about yourself — like you were a failure, or that you had let yourself or your family down?',
  q7: 'How often have you had trouble concentrating on things, such as reading or watching television?',
  q8: 'Have you noticed yourself moving or speaking so slowly that other people might notice? Or the opposite — feeling fidgety or restless, moving around much more than usual?',
  q9: 'In the last two weeks, have you had any thoughts that you would be better off dead, or of hurting yourself in some way? This is an important question we ask everyone.',
}

const GAD7_CONVERSATIONAL: Record<string, string> = {
  q1: 'Over the last two weeks, how often have you felt nervous, anxious, or on edge? Not at all, several days, more than half the days, or nearly every day?',
  q2: 'How often have you been unable to stop or control worrying?',
  q3: 'How often have you found yourself worrying too much about different things?',
  q4: 'How often have you had trouble relaxing?',
  q5: "How often have you been so restless it's been hard to sit still?",
  q6: 'How often have you become easily annoyed or irritable?',
  q7: 'How often have you felt afraid, as if something awful might happen?',
}

const HIT6_CONVERSATIONAL: Record<string, string> = {
  q1: "I'm going to ask you six questions about how headaches have affected you over the past four weeks. For each one, tell me if it's never, rarely, sometimes, very often, or always. First — how often does a headache make the pain severe?",
  q2: 'How often does a headache make you feel too tired to do work or daily activities?',
  q3: 'How often have you wished you could lie down because of a headache?',
  q4: 'In the past four weeks, how often have headaches limited your ability to concentrate on work or daily activities?',
  q5: 'How often have you felt too tired to do work or daily activities because of a headache?',
  q6: 'How often did headaches make you feel fed up or irritated?',
}

const MIDAS_CONVERSATIONAL: Record<string, string> = {
  q1: "Now I have some questions about how headaches have affected your daily life in the last three months. How many days did you miss work or school completely because of a headache?",
  q2: 'On how many days was your productivity at work or school reduced by half or more because of headaches? Please don\'t count days you already mentioned when you missed work entirely.',
  q3: 'How many days did you miss household work or chores because of headaches?',
  q4: 'On how many days was your productivity around the house cut in half or more because of headaches?',
  q5: 'On how many days did you miss family, social, or leisure activities because of headaches?',
}

const ESS_CONVERSATIONAL: Record<string, string> = {
  q1: "I'm going to ask about your chances of dozing off in different situations. For each one, tell me: zero means you would never doze, one means slight chance, two means moderate chance, three means high chance. First — sitting and reading. What's your chance of dozing off?",
  q2: 'Watching TV?',
  q3: 'Sitting inactive in a public place, like a theater or a meeting?',
  q4: 'As a passenger in a car for an hour without a break?',
  q5: 'Lying down to rest in the afternoon when circumstances permit?',
  q6: 'Sitting and talking to someone?',
  q7: 'Sitting quietly after a lunch without alcohol?',
  q8: 'In a car, while stopped for a few minutes in traffic?',
}

const ALSFRS_R_CONVERSATIONAL: Record<string, string> = {
  q1: "I'm going to ask about your current functional abilities in twelve areas. First, your speech. Would you say it's normal, you have a detectable but mild disturbance, people can understand you but sometimes ask you to repeat yourself, you need to combine speech with other ways of communicating, or you've lost useful speech?",
  q2: 'How is your saliva — is it normal, slightly excessive, moderately excessive, markedly excessive with some drooling, or are you drooling constantly?',
  q3: 'How is your swallowing — normal eating habits, occasional choking, you need to change food consistency, you need some tube feeding, or you rely entirely on tube or IV feeding?',
  q4: 'How is your handwriting — normal, slow or sloppy but legible, not all words are legible, you can grip a pen but not write, or you cannot grip a pen at all?',
  q5: 'Cutting food and handling utensils — normal, somewhat clumsy but independent, you can cut most foods with some help, someone else has to cut your food but you can still feed yourself, or you need to be fed?',
  q6: 'Dressing and hygiene — normal, independent but takes more effort, you need some help sometimes, you need an attendant for self-care, or you are totally dependent?',
  q7: 'Turning in bed and adjusting covers — normal, slow but no help needed, you can do it with great difficulty, you can start but not complete the movement, or you are helpless?',
  q8: 'Walking — normal, early difficulties, you walk with assistance, you can move but not walk, or no leg movement at all?',
  q9: 'Climbing stairs — normal, slow, mild unsteadiness or fatigue, you need assistance, or you cannot climb stairs?',
  q10: 'Shortness of breath — none, occurs when walking, occurs with eating, bathing, or dressing, occurs at rest, or you are having significant difficulty and considering breathing support?',
  q11: 'Difficulty breathing when lying flat — none, some difficulty sleeping but usually fewer than two extra pillows, you need more than two pillows, you can only sleep sitting up, or you are unable to sleep?',
  q12: 'Need for breathing support — none, you use BiPAP occasionally, you use BiPAP every night, you use BiPAP day and night, or you are on a ventilator through a tube or tracheostomy?',
}

// ─── Full administration question sets ───────────────────────────────────────

function buildAdminQuestions(
  scale: ScaleDefinition,
  conversationalMap: Record<string, string>
): ScaleAdministrationQuestion[] {
  return scale.questions.map((q) => ({
    id: q.id,
    text: q.text,
    conversationalText: conversationalMap[q.id] ?? q.text,
    responseType: q.type === 'number' ? 'number' : q.options ? 'choice' : 'boolean',
    options: q.options?.map((o) => ({
      value: o.value,
      label: o.label,
      spokenLabel: o.label.replace(/^\d+\s*[—–-]\s*/, ''),
    })),
    min: q.min,
    max: q.max,
  }))
}

// ─── Trigger definitions ──────────────────────────────────────────────────────

/** All scale triggers for the consult pipeline. Ordered by priority (1 = first). */
export const SCALE_TRIGGERS: ScaleTrigger[] = [
  // NIHSS — stroke / TIA (exam required, physician must do it)
  {
    scaleId: 'nihss',
    triggerCategories: ['stroke', 'cerebrovascular', 'tia', 'acute_neurological_deficit'],
    triggerKeywords: [
      'stroke', 'tia', 'face drooping', 'arm weakness', 'speech difficulty',
      'sudden weakness', 'sudden numbness', 'slurred speech', 'vision loss',
      'acute deficit', 'hemiparesis', 'aphasia',
    ],
    adminMode: 'exam_required',
    priority: 1,
    requiresPhysician: true,
  },

  // PHQ-9 — depression
  {
    scaleId: 'phq9',
    triggerCategories: ['depression', 'mood_disorder', 'mental_health', 'neuropsychiatric'],
    triggerKeywords: [
      'depressed', 'depression', 'sad', 'hopeless', 'low mood', 'anhedonia',
      'not enjoying', 'feeling down', 'suicidal', 'worthless', 'guilt',
    ],
    adminMode: 'voice_administrable',
    priority: 2,
    requiresPhysician: false,
  },

  // GAD-7 — anxiety
  {
    scaleId: 'gad7',
    triggerCategories: ['anxiety', 'anxiety_disorder', 'panic', 'mental_health'],
    triggerKeywords: [
      'anxious', 'anxiety', 'panic', 'worry', 'on edge', 'restless',
      'nervousness', 'panic attack', 'fearful',
    ],
    adminMode: 'voice_administrable',
    priority: 3,
    requiresPhysician: false,
  },

  // HIT-6 — headache impact
  {
    scaleId: 'hit6',
    triggerCategories: ['headache', 'migraine', 'tension_headache', 'cluster_headache'],
    triggerKeywords: [
      'headache', 'migraine', 'head pain', 'head pounding', 'throbbing head',
    ],
    adminMode: 'voice_administrable',
    priority: 4,
    requiresPhysician: false,
  },

  // MIDAS — migraine disability
  {
    scaleId: 'midas',
    triggerCategories: ['migraine'],
    triggerKeywords: [
      'migraine', 'migraine disability', 'missed work headache', 'headache missed days',
    ],
    adminMode: 'voice_administrable',
    priority: 5,
    requiresPhysician: false,
  },

  // ESS — sleepiness
  {
    scaleId: 'ess',
    triggerCategories: ['sleep_disorder', 'sleep_apnea', 'hypersomnia', 'narcolepsy'],
    triggerKeywords: [
      'sleepy', 'daytime sleepiness', 'falling asleep', 'tired during the day',
      'sleep apnea', 'narcolepsy', 'dozing off', 'excessive sleepiness',
    ],
    adminMode: 'voice_administrable',
    priority: 6,
    requiresPhysician: false,
  },

  // MoCA — cognitive screening (exam required for visuospatial subtests)
  {
    scaleId: 'moca',
    triggerCategories: ['cognitive_impairment', 'dementia', 'mild_cognitive_impairment', 'memory'],
    triggerKeywords: [
      'memory loss', 'forgetful', 'dementia', 'cognitive decline', 'confusion',
      'alzheimer', 'mci', 'mild cognitive', 'word finding', 'getting lost',
    ],
    adminMode: 'exam_required',
    priority: 7,
    requiresPhysician: true,
  },

  // ALSFRS-R — motor neuron disease
  {
    scaleId: 'alsfrs_r',
    triggerCategories: ['motor_neuron_disease', 'als', 'mnd', 'amyotrophic'],
    triggerKeywords: [
      'als', 'motor neuron', 'muscle weakness', 'fasciculations', 'bulbar',
      'difficulty swallowing', 'slurred speech progressive', 'amyotrophic',
    ],
    adminMode: 'voice_administrable',
    priority: 8,
    requiresPhysician: false,
  },
]

// ─── Administration question registry ────────────────────────────────────────

/**
 * Returns the voice-formatted administration questions for a given scale.
 * Returns null for exam_required scales (they are flagged but not voice-administered).
 */
export function getAdministrationQuestions(
  scaleId: string
): ScaleAdministrationQuestion[] | null {
  switch (scaleId) {
    case 'phq9':
      return buildAdminQuestions(PHQ9, PHQ9_CONVERSATIONAL)
    case 'gad7':
      return buildAdminQuestions(GAD7, GAD7_CONVERSATIONAL)
    case 'hit6':
      return buildAdminQuestions(HIT6, HIT6_CONVERSATIONAL)
    case 'midas':
      return buildAdminQuestions(MIDAS, MIDAS_CONVERSATIONAL)
    case 'ess':
      return buildAdminQuestions(ESS, ESS_CONVERSATIONAL)
    case 'alsfrs_r':
      return buildAdminQuestions(ALSFRS_R, ALSFRS_R_CONVERSATIONAL)
    // Exam-required scales have no voice admin questions
    case 'nihss':
    case 'moca':
      return null
    default:
      return null
  }
}

/**
 * All scale definitions available to the consult pipeline,
 * including those defined here (NIHSS, ALSFRS-R) and re-exported from the base library.
 */
export const CONSULT_SCALE_DEFINITIONS: Record<string, ScaleDefinition> = {
  phq9: PHQ9,
  gad7: GAD7,
  midas: MIDAS,
  hit6: HIT6,
  moca: MOCA,
  ess: ESS,
  nihss: NIHSS,
  alsfrs_r: ALSFRS_R,
}

/** Returns the ScaleDefinition for a given scaleId, or null if not found. */
export function getConsultScaleById(scaleId: string): ScaleDefinition | null {
  return CONSULT_SCALE_DEFINITIONS[scaleId] ?? null
}

/** Feature flag — set false to disable automatic scale administration in the historian */
export const SCALE_AUTO_ADMIN_ENABLED =
  process.env.NEXT_PUBLIC_SCALE_AUTO_ADMIN !== 'false'
