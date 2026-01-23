// Scale Definitions - Priority scales for initial implementation
// Based on PRD_Neurology_Scales.md

import { ScaleDefinition, ConditionScaleMapping } from './types'

// ===========================================
// PHQ-9 - Patient Health Questionnaire-9
// ===========================================
export const PHQ9: ScaleDefinition = {
  id: 'phq9',
  name: 'Patient Health Questionnaire-9',
  abbreviation: 'PHQ-9',
  description: 'A 9-item depression screening and severity measure',
  category: 'mental_health',
  timeToComplete: 3,
  source: 'Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'q1',
      text: 'Little interest or pleasure in doing things',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q2',
      text: 'Feeling down, depressed, or hopeless',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q3',
      text: 'Trouble falling or staying asleep, or sleeping too much',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q4',
      text: 'Feeling tired or having little energy',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q5',
      text: 'Poor appetite or overeating',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q6',
      text: 'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q7',
      text: 'Trouble concentrating on things, such as reading the newspaper or watching television',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q8',
      text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q9',
      text: 'Thoughts that you would be better off dead or of hurting yourself in some way',
      type: 'select',
      required: true,
      alertValue: 1,
      alertMessage: 'Patient endorsed thoughts of self-harm or suicide',
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 4, interpretation: 'Minimal depression', severity: 'minimal', color: '#10B981' },
    { min: 5, max: 9, interpretation: 'Mild depression', severity: 'mild', color: '#84CC16', recommendations: ['Consider watchful waiting', 'Repeat PHQ-9 at follow-up'] },
    { min: 10, max: 14, interpretation: 'Moderate depression', severity: 'moderate', color: '#F59E0B', recommendations: ['Treatment plan recommended', 'Consider counseling referral'] },
    { min: 15, max: 19, interpretation: 'Moderately severe depression', severity: 'moderately_severe', color: '#F97316', recommendations: ['Active treatment recommended', 'Consider psychiatry referral'] },
    { min: 20, max: 27, interpretation: 'Severe depression', severity: 'severe', color: '#EF4444', recommendations: ['Immediate intervention needed', 'Psychiatry referral recommended', 'Assess safety'] },
  ],
  alerts: [
    {
      id: 'phq9-suicidal',
      condition: 'q9 > 0',
      type: 'critical',
      message: 'Patient endorsed suicidal ideation (Question 9). Assess safety immediately.',
      action: 'Perform suicide risk assessment',
    },
    {
      id: 'phq9-severe',
      condition: 'score >= 20',
      type: 'warning',
      message: 'Severe depression score. Consider urgent psychiatric evaluation.',
    },
  ],
}

// ===========================================
// GAD-7 - Generalized Anxiety Disorder 7-item
// ===========================================
export const GAD7: ScaleDefinition = {
  id: 'gad7',
  name: 'Generalized Anxiety Disorder 7-item',
  abbreviation: 'GAD-7',
  description: 'A 7-item anxiety screening and severity measure',
  category: 'mental_health',
  timeToComplete: 2,
  source: 'Spitzer RL, Kroenke K, Williams JB, Löwe B. A brief measure for assessing generalized anxiety disorder. Arch Intern Med. 2006.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'q1',
      text: 'Feeling nervous, anxious, or on edge',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q2',
      text: 'Not being able to stop or control worrying',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q3',
      text: 'Worrying too much about different things',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q4',
      text: 'Trouble relaxing',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q5',
      text: 'Being so restless that it\'s hard to sit still',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q6',
      text: 'Becoming easily annoyed or irritable',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
    {
      id: 'q7',
      text: 'Feeling afraid as if something awful might happen',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all' },
        { value: 1, label: 'Several days' },
        { value: 2, label: 'More than half the days' },
        { value: 3, label: 'Nearly every day' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 4, interpretation: 'Minimal anxiety', severity: 'minimal', color: '#10B981' },
    { min: 5, max: 9, interpretation: 'Mild anxiety', severity: 'mild', color: '#84CC16', recommendations: ['Monitor symptoms', 'Consider follow-up assessment'] },
    { min: 10, max: 14, interpretation: 'Moderate anxiety', severity: 'moderate', color: '#F59E0B', recommendations: ['Consider counseling', 'May benefit from medication'] },
    { min: 15, max: 21, interpretation: 'Severe anxiety', severity: 'severe', color: '#EF4444', recommendations: ['Active treatment recommended', 'Consider psychiatry referral'] },
  ],
  alerts: [
    {
      id: 'gad7-severe',
      condition: 'score >= 15',
      type: 'warning',
      message: 'Severe anxiety score. Consider psychiatric evaluation.',
    },
  ],
}

// ===========================================
// MIDAS - Migraine Disability Assessment
// ===========================================
export const MIDAS: ScaleDefinition = {
  id: 'midas',
  name: 'Migraine Disability Assessment',
  abbreviation: 'MIDAS',
  description: 'Measures headache-related disability over the past 3 months',
  category: 'headache',
  timeToComplete: 5,
  source: 'Stewart WF, et al. Development and testing of the Migraine Disability Assessment (MIDAS) Questionnaire. Neurology. 2001.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'q1',
      text: 'On how many days in the last 3 months did you miss work or school because of your headaches?',
      type: 'number',
      required: true,
      min: 0,
      max: 90,
      helpText: 'Enter number of full days missed',
    },
    {
      id: 'q2',
      text: 'How many days in the last 3 months was your productivity at work or school reduced by half or more because of your headaches?',
      type: 'number',
      required: true,
      min: 0,
      max: 90,
      helpText: 'Do not include days you counted in question 1',
    },
    {
      id: 'q3',
      text: 'On how many days in the last 3 months did you not do household work because of your headaches?',
      type: 'number',
      required: true,
      min: 0,
      max: 90,
    },
    {
      id: 'q4',
      text: 'How many days in the last 3 months was your productivity in household work reduced by half or more because of your headaches?',
      type: 'number',
      required: true,
      min: 0,
      max: 90,
      helpText: 'Do not include days you counted in question 3',
    },
    {
      id: 'q5',
      text: 'On how many days in the last 3 months did you miss family, social, or leisure activities because of your headaches?',
      type: 'number',
      required: true,
      min: 0,
      max: 90,
    },
  ],
  scoringRanges: [
    { min: 0, max: 5, grade: 'Grade I', interpretation: 'Little or no disability', severity: 'minimal', color: '#10B981' },
    { min: 6, max: 10, grade: 'Grade II', interpretation: 'Mild disability', severity: 'mild', color: '#84CC16' },
    { min: 11, max: 20, grade: 'Grade III', interpretation: 'Moderate disability', severity: 'moderate', color: '#F59E0B', recommendations: ['Consider preventive therapy'] },
    { min: 21, max: 270, grade: 'Grade IV', interpretation: 'Severe disability', severity: 'severe', color: '#EF4444', recommendations: ['Preventive therapy strongly recommended', 'Consider headache specialist referral'] },
  ],
  alerts: [
    {
      id: 'midas-severe',
      condition: 'score >= 21',
      type: 'warning',
      message: 'Severe headache disability. Preventive therapy strongly recommended.',
    },
  ],
}

// ===========================================
// HIT-6 - Headache Impact Test
// ===========================================
export const HIT6: ScaleDefinition = {
  id: 'hit6',
  name: 'Headache Impact Test',
  abbreviation: 'HIT-6',
  description: 'Measures the impact headaches have on daily life',
  category: 'headache',
  timeToComplete: 2,
  source: 'Kosinski M, et al. A six-item short-form survey for measuring headache impact: the HIT-6. Qual Life Res. 2003.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'q1',
      text: 'When you have headaches, how often is the pain severe?',
      type: 'select',
      required: true,
      options: [
        { value: 6, label: 'Never' },
        { value: 8, label: 'Rarely' },
        { value: 10, label: 'Sometimes' },
        { value: 11, label: 'Very often' },
        { value: 13, label: 'Always' },
      ],
    },
    {
      id: 'q2',
      text: 'How often do headaches limit your ability to do usual daily activities including household work, work, school, or social activities?',
      type: 'select',
      required: true,
      options: [
        { value: 6, label: 'Never' },
        { value: 8, label: 'Rarely' },
        { value: 10, label: 'Sometimes' },
        { value: 11, label: 'Very often' },
        { value: 13, label: 'Always' },
      ],
    },
    {
      id: 'q3',
      text: 'When you have a headache, how often do you wish you could lie down?',
      type: 'select',
      required: true,
      options: [
        { value: 6, label: 'Never' },
        { value: 8, label: 'Rarely' },
        { value: 10, label: 'Sometimes' },
        { value: 11, label: 'Very often' },
        { value: 13, label: 'Always' },
      ],
    },
    {
      id: 'q4',
      text: 'In the past 4 weeks, how often have you felt too tired to do work or daily activities because of your headaches?',
      type: 'select',
      required: true,
      options: [
        { value: 6, label: 'Never' },
        { value: 8, label: 'Rarely' },
        { value: 10, label: 'Sometimes' },
        { value: 11, label: 'Very often' },
        { value: 13, label: 'Always' },
      ],
    },
    {
      id: 'q5',
      text: 'In the past 4 weeks, how often have you felt fed up or irritated because of your headaches?',
      type: 'select',
      required: true,
      options: [
        { value: 6, label: 'Never' },
        { value: 8, label: 'Rarely' },
        { value: 10, label: 'Sometimes' },
        { value: 11, label: 'Very often' },
        { value: 13, label: 'Always' },
      ],
    },
    {
      id: 'q6',
      text: 'In the past 4 weeks, how often did headaches limit your ability to concentrate on work or daily activities?',
      type: 'select',
      required: true,
      options: [
        { value: 6, label: 'Never' },
        { value: 8, label: 'Rarely' },
        { value: 10, label: 'Sometimes' },
        { value: 11, label: 'Very often' },
        { value: 13, label: 'Always' },
      ],
    },
  ],
  scoringRanges: [
    { min: 36, max: 49, interpretation: 'Little or no impact', severity: 'minimal', color: '#10B981' },
    { min: 50, max: 55, interpretation: 'Some impact', severity: 'mild', color: '#84CC16' },
    { min: 56, max: 59, interpretation: 'Substantial impact', severity: 'moderate', color: '#F59E0B', recommendations: ['Consider discussing treatment options'] },
    { min: 60, max: 78, interpretation: 'Severe impact', severity: 'severe', color: '#EF4444', recommendations: ['Treatment modification recommended', 'Consider specialist referral'] },
  ],
  alerts: [
    {
      id: 'hit6-severe',
      condition: 'score >= 60',
      type: 'warning',
      message: 'Severe headache impact. Consider treatment optimization.',
    },
  ],
}

// ===========================================
// MoCA - Montreal Cognitive Assessment (Simplified)
// ===========================================
export const MOCA: ScaleDefinition = {
  id: 'moca',
  name: 'Montreal Cognitive Assessment',
  abbreviation: 'MoCA',
  description: 'Brief cognitive screening tool for mild cognitive impairment',
  category: 'cognitive',
  timeToComplete: 10,
  source: 'Nasreddine ZS, et al. The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment. J Am Geriatr Soc. 2005.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'visuospatial',
      text: 'Visuospatial/Executive (Trail Making, Cube, Clock)',
      type: 'number',
      required: true,
      min: 0,
      max: 5,
      helpText: 'Score 0-5 points',
    },
    {
      id: 'naming',
      text: 'Naming (Lion, Rhinoceros, Camel)',
      type: 'number',
      required: true,
      min: 0,
      max: 3,
      helpText: 'Score 0-3 points',
    },
    {
      id: 'attention',
      text: 'Attention (Digit span, Letter A tapping, Serial 7s)',
      type: 'number',
      required: true,
      min: 0,
      max: 6,
      helpText: 'Score 0-6 points',
    },
    {
      id: 'language',
      text: 'Language (Sentence repetition, Fluency)',
      type: 'number',
      required: true,
      min: 0,
      max: 3,
      helpText: 'Score 0-3 points',
    },
    {
      id: 'abstraction',
      text: 'Abstraction (Similarity)',
      type: 'number',
      required: true,
      min: 0,
      max: 2,
      helpText: 'Score 0-2 points',
    },
    {
      id: 'delayed_recall',
      text: 'Delayed Recall (5 words)',
      type: 'number',
      required: true,
      min: 0,
      max: 5,
      helpText: 'Score 0-5 points',
    },
    {
      id: 'orientation',
      text: 'Orientation (Date, Month, Year, Day, Place, City)',
      type: 'number',
      required: true,
      min: 0,
      max: 6,
      helpText: 'Score 0-6 points',
    },
    {
      id: 'education_adjustment',
      text: 'Education ≤12 years (add 1 point)?',
      type: 'boolean',
      required: false,
      helpText: 'Add 1 point if patient has 12 or fewer years of education',
    },
  ],
  scoringRanges: [
    { min: 26, max: 30, interpretation: 'Normal', severity: 'minimal', color: '#10B981' },
    { min: 18, max: 25, interpretation: 'Mild cognitive impairment', severity: 'mild', color: '#F59E0B', recommendations: ['Consider further cognitive evaluation', 'Assess reversible causes'] },
    { min: 10, max: 17, interpretation: 'Moderate cognitive impairment', severity: 'moderate', color: '#F97316', recommendations: ['Comprehensive cognitive evaluation recommended', 'Consider neuropsychological testing'] },
    { min: 0, max: 9, interpretation: 'Severe cognitive impairment', severity: 'severe', color: '#EF4444', recommendations: ['Urgent cognitive evaluation', 'Assess capacity and safety'] },
  ],
  alerts: [
    {
      id: 'moca-impaired',
      condition: 'score < 18',
      type: 'warning',
      message: 'Significant cognitive impairment detected. Consider comprehensive evaluation.',
    },
  ],
}

// ===========================================
// ESS - Epworth Sleepiness Scale
// ===========================================
export const ESS: ScaleDefinition = {
  id: 'ess',
  name: 'Epworth Sleepiness Scale',
  abbreviation: 'ESS',
  description: 'Measures general level of daytime sleepiness',
  category: 'sleep',
  timeToComplete: 3,
  source: 'Johns MW. A new method for measuring daytime sleepiness: the Epworth sleepiness scale. Sleep. 1991.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'q1',
      text: 'Sitting and reading',
      type: 'select',
      required: true,
      helpText: 'How likely are you to doze off or fall asleep in this situation?',
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q2',
      text: 'Watching TV',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q3',
      text: 'Sitting inactive in a public place (e.g., theater or meeting)',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q4',
      text: 'As a passenger in a car for an hour without a break',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q5',
      text: 'Lying down to rest in the afternoon when circumstances permit',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q6',
      text: 'Sitting and talking to someone',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q7',
      text: 'Sitting quietly after a lunch without alcohol',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
    {
      id: 'q8',
      text: 'In a car, while stopped for a few minutes in traffic',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Would never doze' },
        { value: 1, label: 'Slight chance of dozing' },
        { value: 2, label: 'Moderate chance of dozing' },
        { value: 3, label: 'High chance of dozing' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 10, interpretation: 'Normal daytime sleepiness', severity: 'minimal', color: '#10B981' },
    { min: 11, max: 14, interpretation: 'Mild excessive daytime sleepiness', severity: 'mild', color: '#84CC16', recommendations: ['Consider sleep hygiene counseling'] },
    { min: 15, max: 17, interpretation: 'Moderate excessive daytime sleepiness', severity: 'moderate', color: '#F59E0B', recommendations: ['Consider sleep study', 'Assess for sleep disorders'] },
    { min: 18, max: 24, interpretation: 'Severe excessive daytime sleepiness', severity: 'severe', color: '#EF4444', recommendations: ['Sleep study recommended', 'Assess driving safety'] },
  ],
  alerts: [
    {
      id: 'ess-severe',
      condition: 'score >= 15',
      type: 'warning',
      message: 'Significant daytime sleepiness. Consider sleep study and driving safety assessment.',
    },
  ],
}

// ===========================================
// All Scale Definitions
// ===========================================
export const ALL_SCALES: Record<string, ScaleDefinition> = {
  phq9: PHQ9,
  gad7: GAD7,
  midas: MIDAS,
  hit6: HIT6,
  moca: MOCA,
  ess: ESS,
}

// ===========================================
// Condition to Scale Mapping
// Based on PRD Appendix: Scale Selection by Condition
// ===========================================
export const CONDITION_SCALE_MAPPINGS: ConditionScaleMapping[] = [
  // Headache & Pain
  { condition: 'Migraine', scaleId: 'midas', priority: 1, isRequired: false },
  { condition: 'Migraine', scaleId: 'hit6', priority: 2, isRequired: false },
  { condition: 'Migraine', scaleId: 'phq9', priority: 3, isRequired: false },
  { condition: 'Migraine', scaleId: 'gad7', priority: 4, isRequired: false },

  { condition: 'Chronic migraine', scaleId: 'midas', priority: 1, isRequired: false },
  { condition: 'Chronic migraine', scaleId: 'hit6', priority: 2, isRequired: false },
  { condition: 'Chronic migraine', scaleId: 'phq9', priority: 3, isRequired: false },
  { condition: 'Chronic migraine', scaleId: 'gad7', priority: 4, isRequired: false },

  { condition: 'Tension headache', scaleId: 'hit6', priority: 1, isRequired: false },
  { condition: 'Tension headache', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Cluster headache', scaleId: 'hit6', priority: 1, isRequired: false },
  { condition: 'Cluster headache', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'New daily persistent headache', scaleId: 'midas', priority: 1, isRequired: false },
  { condition: 'New daily persistent headache', scaleId: 'hit6', priority: 2, isRequired: false },
  { condition: 'New daily persistent headache', scaleId: 'phq9', priority: 3, isRequired: false },

  { condition: 'Medication overuse headache', scaleId: 'midas', priority: 1, isRequired: false },
  { condition: 'Medication overuse headache', scaleId: 'hit6', priority: 2, isRequired: false },
  { condition: 'Medication overuse headache', scaleId: 'phq9', priority: 3, isRequired: false },

  { condition: 'Post-traumatic headache', scaleId: 'hit6', priority: 1, isRequired: false },
  { condition: 'Post-traumatic headache', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Post-traumatic headache', scaleId: 'moca', priority: 3, isRequired: false },

  // Movement Disorders
  { condition: 'Parkinson disease', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Parkinson disease', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Parkinson disease', scaleId: 'ess', priority: 3, isRequired: false },

  { condition: 'Essential tremor', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Essential tremor', scaleId: 'gad7', priority: 2, isRequired: false },

  { condition: 'Restless legs syndrome', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'Restless legs syndrome', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Huntington disease', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Huntington disease', scaleId: 'phq9', priority: 2, isRequired: false },

  // Epilepsy & Seizures
  { condition: 'Epilepsy', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Epilepsy', scaleId: 'ess', priority: 2, isRequired: false },
  { condition: 'Epilepsy', scaleId: 'gad7', priority: 3, isRequired: false },

  { condition: 'New onset seizure', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'New onset seizure', scaleId: 'moca', priority: 2, isRequired: false },

  { condition: 'Breakthrough seizures', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Breakthrough seizures', scaleId: 'ess', priority: 2, isRequired: false },

  // Dementia & Cognitive
  { condition: 'Memory loss', scaleId: 'moca', priority: 1, isRequired: true },
  { condition: 'Memory loss', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Mild cognitive impairment', scaleId: 'moca', priority: 1, isRequired: true },
  { condition: 'Mild cognitive impairment', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Alzheimer disease', scaleId: 'moca', priority: 1, isRequired: true },
  { condition: 'Alzheimer disease', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Dementia evaluation', scaleId: 'moca', priority: 1, isRequired: true },
  { condition: 'Dementia evaluation', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Frontotemporal dementia', scaleId: 'moca', priority: 1, isRequired: true },
  { condition: 'Frontotemporal dementia', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Lewy body dementia', scaleId: 'moca', priority: 1, isRequired: true },
  { condition: 'Lewy body dementia', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Lewy body dementia', scaleId: 'ess', priority: 3, isRequired: false },

  // Neuromuscular
  { condition: 'Peripheral neuropathy', scaleId: 'phq9', priority: 1, isRequired: false },

  { condition: 'Myasthenia gravis', scaleId: 'phq9', priority: 1, isRequired: false },

  { condition: 'ALS/Motor neuron disease', scaleId: 'phq9', priority: 1, isRequired: false },

  // MS & Neuroimmunology
  { condition: 'Multiple sclerosis', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Multiple sclerosis', scaleId: 'moca', priority: 2, isRequired: false },
  { condition: 'Multiple sclerosis', scaleId: 'ess', priority: 3, isRequired: false },

  { condition: 'MS follow-up', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'MS follow-up', scaleId: 'moca', priority: 2, isRequired: false },

  // Sleep
  { condition: 'Narcolepsy', scaleId: 'ess', priority: 1, isRequired: true },
  { condition: 'Narcolepsy', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Insomnia', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'Insomnia', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Insomnia', scaleId: 'gad7', priority: 3, isRequired: false },

  { condition: 'Sleep apnea evaluation', scaleId: 'ess', priority: 1, isRequired: true },
  { condition: 'Sleep apnea evaluation', scaleId: 'phq9', priority: 2, isRequired: false },

  // Other Common
  { condition: 'Dizziness/Vertigo', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Dizziness/Vertigo', scaleId: 'gad7', priority: 2, isRequired: false },

  { condition: 'Concussion/Post-concussion syndrome', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Concussion/Post-concussion syndrome', scaleId: 'moca', priority: 2, isRequired: false },
  { condition: 'Concussion/Post-concussion syndrome', scaleId: 'hit6', priority: 3, isRequired: false },

  { condition: 'Stroke follow-up', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Stroke follow-up', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'TIA evaluation', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'TIA evaluation', scaleId: 'phq9', priority: 2, isRequired: false },
]

// ===========================================
// Helper function to get scales for a condition
// ===========================================
export function getScalesForCondition(condition: string): (ScaleDefinition & { priority: number; isRequired: boolean })[] {
  const mappings = CONDITION_SCALE_MAPPINGS.filter(m => m.condition === condition)

  return mappings
    .map(mapping => {
      const scale = ALL_SCALES[mapping.scaleId]
      if (!scale) return null
      return {
        ...scale,
        priority: mapping.priority,
        isRequired: mapping.isRequired,
      }
    })
    .filter((s): s is ScaleDefinition & { priority: number; isRequired: boolean } => s !== null)
    .sort((a, b) => a.priority - b.priority)
}

// ===========================================
// Get all conditions that have scales
// ===========================================
export function getConditionsWithScales(): string[] {
  return [...new Set(CONDITION_SCALE_MAPPINGS.map(m => m.condition))]
}
