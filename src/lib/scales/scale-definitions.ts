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
// NIHSS - NIH Stroke Scale (Complete 15-item version)
// ===========================================
export const NIHSS: ScaleDefinition = {
  id: 'nihss',
  name: 'NIH Stroke Scale',
  abbreviation: 'NIHSS',
  description: 'Standardized stroke severity scale used to quantify neurologic deficit. Can be performed with MA assistance.',
  category: 'other',
  timeToComplete: 10,
  source: 'National Institute of Neurological Disorders and Stroke (NINDS). NIH Stroke Scale.',
  scoringMethod: 'sum',
  questions: [
    {
      id: '1a_loc',
      text: '1a. Level of Consciousness',
      type: 'select',
      required: true,
      helpText: 'The investigator must choose a response even if full evaluation is precluded by obstacles',
      options: [
        { value: 0, label: '0 = Alert; keenly responsive' },
        { value: 1, label: '1 = Not alert; arousable by minor stimulation' },
        { value: 2, label: '2 = Not alert; requires repeated stimulation to attend' },
        { value: 3, label: '3 = Responds only with reflex motor or autonomic effects, or unresponsive' },
      ],
    },
    {
      id: '1b_loc_questions',
      text: '1b. LOC Questions (Month and Age)',
      type: 'select',
      required: true,
      helpText: 'Ask patient the month and their age. Score first answer only.',
      options: [
        { value: 0, label: '0 = Answers both questions correctly' },
        { value: 1, label: '1 = Answers one question correctly' },
        { value: 2, label: '2 = Answers neither question correctly' },
      ],
    },
    {
      id: '1c_loc_commands',
      text: '1c. LOC Commands (Open/Close Eyes, Grip/Release)',
      type: 'select',
      required: true,
      helpText: 'Ask patient to open and close eyes, then grip and release non-paretic hand.',
      options: [
        { value: 0, label: '0 = Performs both tasks correctly' },
        { value: 1, label: '1 = Performs one task correctly' },
        { value: 2, label: '2 = Performs neither task correctly' },
      ],
    },
    {
      id: '2_gaze',
      text: '2. Best Gaze (Horizontal Eye Movement)',
      type: 'select',
      required: true,
      helpText: 'Test horizontal eye movements only. Score gaze deviation that can be overcome.',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Partial gaze palsy (abnormal gaze in one or both eyes but no forced deviation)' },
        { value: 2, label: '2 = Forced deviation or total gaze paresis not overcome by oculocephalic maneuver' },
      ],
    },
    {
      id: '3_visual',
      text: '3. Visual Fields',
      type: 'select',
      required: true,
      helpText: 'Test visual fields by confrontation. Score only if clear-cut asymmetry.',
      options: [
        { value: 0, label: '0 = No visual loss' },
        { value: 1, label: '1 = Partial hemianopia' },
        { value: 2, label: '2 = Complete hemianopia' },
        { value: 3, label: '3 = Bilateral hemianopia (blind including cortical blindness)' },
      ],
    },
    {
      id: '4_facial',
      text: '4. Facial Palsy',
      type: 'select',
      required: true,
      helpText: 'Ask patient to show teeth, raise eyebrows, and squeeze eyes shut.',
      options: [
        { value: 0, label: '0 = Normal symmetrical movements' },
        { value: 1, label: '1 = Minor paralysis (flattened nasolabial fold, asymmetry on smiling)' },
        { value: 2, label: '2 = Partial paralysis (total or near-total paralysis of lower face)' },
        { value: 3, label: '3 = Complete paralysis (absence of facial movement in upper and lower face)' },
      ],
    },
    {
      id: '5a_motor_left_arm',
      text: '5a. Motor Arm - Left',
      type: 'select',
      required: true,
      helpText: 'Arm is placed at 90° (sitting) or 45° (supine). Drift is scored if arm falls within 10 seconds.',
      options: [
        { value: 0, label: '0 = No drift; limb holds 90° (or 45°) for full 10 seconds' },
        { value: 1, label: '1 = Drift; limb holds but drifts down before full 10 seconds' },
        { value: 2, label: '2 = Some effort against gravity; limb cannot get to or maintain position' },
        { value: 3, label: '3 = No effort against gravity; limb falls' },
        { value: 4, label: '4 = No movement' },
      ],
    },
    {
      id: '5b_motor_right_arm',
      text: '5b. Motor Arm - Right',
      type: 'select',
      required: true,
      helpText: 'Arm is placed at 90° (sitting) or 45° (supine). Drift is scored if arm falls within 10 seconds.',
      options: [
        { value: 0, label: '0 = No drift; limb holds 90° (or 45°) for full 10 seconds' },
        { value: 1, label: '1 = Drift; limb holds but drifts down before full 10 seconds' },
        { value: 2, label: '2 = Some effort against gravity; limb cannot get to or maintain position' },
        { value: 3, label: '3 = No effort against gravity; limb falls' },
        { value: 4, label: '4 = No movement' },
      ],
    },
    {
      id: '6a_motor_left_leg',
      text: '6a. Motor Leg - Left',
      type: 'select',
      required: true,
      helpText: 'Leg is placed at 30° (supine). Drift is scored if leg falls within 5 seconds.',
      options: [
        { value: 0, label: '0 = No drift; leg holds 30° position for full 5 seconds' },
        { value: 1, label: '1 = Drift; leg falls by end of 5-second period but does not hit bed' },
        { value: 2, label: '2 = Some effort against gravity; leg falls to bed by 5 seconds' },
        { value: 3, label: '3 = No effort against gravity; leg falls to bed immediately' },
        { value: 4, label: '4 = No movement' },
      ],
    },
    {
      id: '6b_motor_right_leg',
      text: '6b. Motor Leg - Right',
      type: 'select',
      required: true,
      helpText: 'Leg is placed at 30° (supine). Drift is scored if leg falls within 5 seconds.',
      options: [
        { value: 0, label: '0 = No drift; leg holds 30° position for full 5 seconds' },
        { value: 1, label: '1 = Drift; leg falls by end of 5-second period but does not hit bed' },
        { value: 2, label: '2 = Some effort against gravity; leg falls to bed by 5 seconds' },
        { value: 3, label: '3 = No effort against gravity; leg falls to bed immediately' },
        { value: 4, label: '4 = No movement' },
      ],
    },
    {
      id: '7_ataxia',
      text: '7. Limb Ataxia',
      type: 'select',
      required: true,
      helpText: 'Finger-nose-finger and heel-shin tests on both sides. Score only if clearly out of proportion to weakness.',
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Present in one limb' },
        { value: 2, label: '2 = Present in two limbs' },
      ],
    },
    {
      id: '8_sensory',
      text: '8. Sensory',
      type: 'select',
      required: true,
      helpText: 'Test with pinprick or withdrawal from noxious stimulus in obtunded patients.',
      options: [
        { value: 0, label: '0 = Normal; no sensory loss' },
        { value: 1, label: '1 = Mild-to-moderate sensory loss (less sharp or dull on affected side)' },
        { value: 2, label: '2 = Severe or total sensory loss (not aware of being touched in face, arm, and leg)' },
      ],
    },
    {
      id: '9_language',
      text: '9. Best Language',
      type: 'select',
      required: true,
      helpText: 'Ask patient to describe picture, name items, read sentences. Intubated patients can write.',
      options: [
        { value: 0, label: '0 = No aphasia; normal' },
        { value: 1, label: '1 = Mild-to-moderate aphasia (loss of fluency, word-finding errors, naming errors)' },
        { value: 2, label: '2 = Severe aphasia (fragmentary expression, great need for inference)' },
        { value: 3, label: '3 = Mute, global aphasia; no usable speech or comprehension' },
      ],
    },
    {
      id: '10_dysarthria',
      text: '10. Dysarthria',
      type: 'select',
      required: true,
      helpText: 'Ask patient to read or repeat words. Rate clarity of articulation.',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Mild-to-moderate dysarthria (slurs some words, can still be understood)' },
        { value: 2, label: '2 = Severe dysarthria (speech unintelligible or anarthric)' },
      ],
    },
    {
      id: '11_extinction',
      text: '11. Extinction and Inattention (Neglect)',
      type: 'select',
      required: true,
      helpText: 'Test for visual-spatial neglect and sensory extinction with double simultaneous stimulation.',
      options: [
        { value: 0, label: '0 = No abnormality' },
        { value: 1, label: '1 = Visual, tactile, auditory, or personal inattention or extinction to bilateral stimulation in one modality' },
        { value: 2, label: '2 = Profound hemi-inattention or extinction to more than one modality' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 0, interpretation: 'No stroke symptoms', severity: 'minimal', color: '#10B981' },
    { min: 1, max: 4, interpretation: 'Minor stroke', severity: 'mild', color: '#84CC16', recommendations: ['Consider tPA if within window', 'Close monitoring'] },
    { min: 5, max: 15, interpretation: 'Moderate stroke', severity: 'moderate', color: '#F59E0B', recommendations: ['Strong tPA candidate if eligible', 'Consider thrombectomy evaluation', 'Stroke unit admission'] },
    { min: 16, max: 20, interpretation: 'Moderate to severe stroke', severity: 'moderately_severe', color: '#F97316', recommendations: ['ICU level care', 'Thrombectomy evaluation if LVO', 'Close neurological monitoring'] },
    { min: 21, max: 42, interpretation: 'Severe stroke', severity: 'severe', color: '#EF4444', recommendations: ['ICU admission', 'Goals of care discussion', 'Thrombectomy if LVO and appropriate'] },
  ],
  alerts: [
    {
      id: 'nihss-severe',
      condition: 'score >= 16',
      type: 'critical',
      message: 'Severe stroke - consider ICU level care and thrombectomy evaluation if LVO.',
      action: 'Urgent stroke team notification',
    },
    {
      id: 'nihss-moderate',
      condition: 'score >= 5',
      type: 'warning',
      message: 'Moderate stroke - evaluate for acute interventions if within treatment window.',
    },
  ],
}

// ===========================================
// Modified Ashworth Scale (Spasticity)
// ===========================================
export const MODIFIED_ASHWORTH: ScaleDefinition = {
  id: 'modified_ashworth',
  name: 'Modified Ashworth Scale',
  abbreviation: 'MAS',
  description: 'Measures muscle spasticity/tone. Exam-driven scale for telemedicine with MA assistance.',
  category: 'movement',
  timeToComplete: 5,
  source: 'Bohannon RW, Smith MB. Interrater reliability of a modified Ashworth scale of muscle spasticity. Phys Ther. 1987.',
  scoringMethod: 'custom',
  questions: [
    {
      id: 'muscle_group',
      text: 'Muscle Group Being Tested',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Upper Extremity - Elbow Flexors' },
        { value: 1, label: 'Upper Extremity - Elbow Extensors' },
        { value: 2, label: 'Upper Extremity - Wrist Flexors' },
        { value: 3, label: 'Lower Extremity - Hip Adductors' },
        { value: 4, label: 'Lower Extremity - Knee Flexors' },
        { value: 5, label: 'Lower Extremity - Ankle Plantar Flexors' },
      ],
    },
    {
      id: 'left_side',
      text: 'Left Side Score',
      type: 'select',
      required: true,
      helpText: 'Score the resistance felt during passive movement',
      options: [
        { value: 0, label: '0 = No increase in muscle tone' },
        { value: 1, label: '1 = Slight increase; catch and release at end of ROM' },
        { value: 2, label: '1+ = Slight increase; catch followed by minimal resistance through <50% ROM' },
        { value: 3, label: '2 = Marked increase through most of ROM, but affected part easily moved' },
        { value: 4, label: '3 = Considerable increase; passive movement difficult' },
        { value: 5, label: '4 = Affected part rigid in flexion or extension' },
      ],
    },
    {
      id: 'right_side',
      text: 'Right Side Score',
      type: 'select',
      required: true,
      helpText: 'Score the resistance felt during passive movement',
      options: [
        { value: 0, label: '0 = No increase in muscle tone' },
        { value: 1, label: '1 = Slight increase; catch and release at end of ROM' },
        { value: 2, label: '1+ = Slight increase; catch followed by minimal resistance through <50% ROM' },
        { value: 3, label: '2 = Marked increase through most of ROM, but affected part easily moved' },
        { value: 4, label: '3 = Considerable increase; passive movement difficult' },
        { value: 5, label: '4 = Affected part rigid in flexion or extension' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 0, interpretation: 'No spasticity', severity: 'minimal', color: '#10B981' },
    { min: 1, max: 2, interpretation: 'Mild spasticity', severity: 'mild', color: '#84CC16' },
    { min: 3, max: 3, interpretation: 'Moderate spasticity', severity: 'moderate', color: '#F59E0B', recommendations: ['Consider baclofen or tizanidine', 'Physical therapy referral'] },
    { min: 4, max: 5, interpretation: 'Severe spasticity', severity: 'severe', color: '#EF4444', recommendations: ['Consider botulinum toxin injection', 'Physiatry referral', 'Intrathecal baclofen evaluation'] },
  ],
}

// ===========================================
// ABCD2 Score (TIA Risk)
// ===========================================
export const ABCD2: ScaleDefinition = {
  id: 'abcd2',
  name: 'ABCD2 Score',
  abbreviation: 'ABCD2',
  description: 'Risk stratification for stroke after TIA. History-based scale.',
  category: 'other',
  timeToComplete: 2,
  source: 'Johnston SC, et al. Validation and refinement of scores to predict very early stroke risk after TIA. Lancet. 2007.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'age',
      text: 'A - Age ≥60 years?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'blood_pressure',
      text: 'B - Blood Pressure ≥140/90 at initial evaluation?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'clinical_features',
      text: 'C - Clinical Features',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Other symptoms (0 points)' },
        { value: 1, label: 'Speech disturbance without weakness (1 point)' },
        { value: 2, label: 'Unilateral weakness (2 points)' },
      ],
    },
    {
      id: 'duration',
      text: 'D - Duration of Symptoms',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '<10 minutes (0 points)' },
        { value: 1, label: '10-59 minutes (1 point)' },
        { value: 2, label: '≥60 minutes (2 points)' },
      ],
    },
    {
      id: 'diabetes',
      text: 'D - Diabetes?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 3, interpretation: 'Low risk (1% 2-day stroke risk)', severity: 'mild', color: '#84CC16', recommendations: ['Outpatient workup may be appropriate', 'Rapid TIA clinic follow-up'] },
    { min: 4, max: 5, interpretation: 'Moderate risk (4.1% 2-day stroke risk)', severity: 'moderate', color: '#F59E0B', recommendations: ['Hospital admission recommended', 'Expedited workup'] },
    { min: 6, max: 7, interpretation: 'High risk (8.1% 2-day stroke risk)', severity: 'severe', color: '#EF4444', recommendations: ['Hospital admission strongly recommended', 'Urgent neurology consultation', 'Consider stroke unit'] },
  ],
  alerts: [
    {
      id: 'abcd2-high',
      condition: 'score >= 6',
      type: 'critical',
      message: 'High risk for stroke within 48 hours. Hospital admission strongly recommended.',
      action: 'Admit for expedited workup',
    },
  ],
}

// ===========================================
// DHI - Dizziness Handicap Inventory (Short Form)
// ===========================================
export const DHI: ScaleDefinition = {
  id: 'dhi',
  name: 'Dizziness Handicap Inventory',
  abbreviation: 'DHI',
  description: 'Assesses self-perceived handicap due to dizziness. History-based scale.',
  category: 'other',
  timeToComplete: 5,
  source: 'Jacobson GP, Newman CW. The development of the Dizziness Handicap Inventory. Arch Otolaryngol Head Neck Surg. 1990.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'p1',
      text: 'Does looking up increase your problem?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'e1',
      text: 'Because of your problem, do you feel frustrated?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'f1',
      text: 'Because of your problem, do you restrict your travel for business or recreation?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'p2',
      text: 'Does walking down a supermarket aisle increase your problem?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'f2',
      text: 'Because of your problem, do you have difficulty getting into or out of bed?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'f3',
      text: 'Does your problem significantly restrict your participation in social activities?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'f4',
      text: 'Because of your problem, do you have difficulty reading?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'p3',
      text: 'Does performing more ambitious activities (sports, dancing, household chores) increase your problem?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'e2',
      text: 'Because of your problem, are you afraid to leave your home without having someone accompany you?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
    {
      id: 'e3',
      text: 'Because of your problem, have you been embarrassed in front of others?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No' },
        { value: 2, label: 'Sometimes' },
        { value: 4, label: 'Yes' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 14, interpretation: 'No handicap', severity: 'minimal', color: '#10B981' },
    { min: 15, max: 24, interpretation: 'Mild handicap', severity: 'mild', color: '#84CC16' },
    { min: 25, max: 34, interpretation: 'Moderate handicap', severity: 'moderate', color: '#F59E0B', recommendations: ['Vestibular rehabilitation referral', 'Consider medication optimization'] },
    { min: 35, max: 40, interpretation: 'Severe handicap', severity: 'severe', color: '#EF4444', recommendations: ['Urgent vestibular evaluation', 'Consider fall precautions', 'Vestibular PT mandatory'] },
  ],
}

// ===========================================
// Mini-Cog (Brief Cognitive Screen)
// ===========================================
export const MINI_COG: ScaleDefinition = {
  id: 'mini_cog',
  name: 'Mini-Cog',
  abbreviation: 'Mini-Cog',
  description: 'Brief 3-minute cognitive screening test. Can be performed via telemedicine.',
  category: 'cognitive',
  timeToComplete: 3,
  source: 'Borson S, et al. The Mini-Cog as a screen for dementia: validation in a population-based sample. J Am Geriatr Soc. 2003.',
  scoringMethod: 'custom',
  questions: [
    {
      id: 'word_recall',
      text: 'Word Recall (3 words)',
      type: 'select',
      required: true,
      helpText: 'Register 3 unrelated words, then recall after clock draw. Score words recalled.',
      options: [
        { value: 0, label: '0 words recalled' },
        { value: 1, label: '1 word recalled' },
        { value: 2, label: '2 words recalled' },
        { value: 3, label: '3 words recalled' },
      ],
    },
    {
      id: 'clock_draw',
      text: 'Clock Drawing Test',
      type: 'select',
      required: true,
      helpText: 'Draw clock face showing 10 minutes past 11. Score 0 for abnormal, 2 for normal.',
      options: [
        { value: 0, label: 'Abnormal (0 points)' },
        { value: 2, label: 'Normal (2 points)' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 2, interpretation: 'Positive screen - possible cognitive impairment', severity: 'moderate', color: '#F59E0B', recommendations: ['Further cognitive evaluation recommended', 'Consider full MoCA', 'Assess for reversible causes'] },
    { min: 3, max: 5, interpretation: 'Negative screen - normal cognition', severity: 'minimal', color: '#10B981' },
  ],
  alerts: [
    {
      id: 'minicog-positive',
      condition: 'score <= 2',
      type: 'warning',
      message: 'Positive screen for cognitive impairment. Further evaluation recommended.',
      action: 'Consider comprehensive cognitive assessment (MoCA, neuropsychological testing)',
    },
  ],
}

// ===========================================
// UPDRS Motor Exam - Unified Parkinson's Disease Rating Scale (Part III - Motor)
// ===========================================
export const UPDRS_MOTOR: ScaleDefinition = {
  id: 'updrs_motor',
  name: 'UPDRS Part III - Motor Examination',
  abbreviation: 'UPDRS-III',
  description: 'Motor examination section of UPDRS for Parkinson\'s disease assessment. Exam-driven scale that can be performed with MA assistance via telemedicine.',
  category: 'movement',
  timeToComplete: 15,
  source: 'Goetz CG, et al. Movement Disorder Society-sponsored revision of the UPDRS. Movement Disorders. 2008.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'speech',
      text: '3.1 Speech',
      type: 'select',
      required: true,
      helpText: 'Observe spontaneous speech and during conversation',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight loss of expression, diction, and/or volume' },
        { value: 2, label: '2 = Monotone, slurred but understandable' },
        { value: 3, label: '3 = Marked impairment, difficult to understand' },
        { value: 4, label: '4 = Unintelligible' },
      ],
    },
    {
      id: 'facial_expression',
      text: '3.2 Facial Expression',
      type: 'select',
      required: true,
      helpText: 'Observe facial expression at rest and during conversation',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Minimal masked facies, could be normal "poker face"' },
        { value: 2, label: '2 = Slight but definitely abnormal diminution of facial expression' },
        { value: 3, label: '3 = Moderate hypomimia; lips parted some of the time' },
        { value: 4, label: '4 = Masked or fixed facies with severe or complete loss of expression' },
      ],
    },
    {
      id: 'rigidity_neck',
      text: '3.3a Rigidity - Neck',
      type: 'select',
      required: true,
      helpText: 'Judge on passive movement of major joints. Rate neck rigidity.',
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight or detectable only when activated' },
        { value: 2, label: '2 = Mild to moderate' },
        { value: 3, label: '3 = Marked, but full ROM easily achieved' },
        { value: 4, label: '4 = Severe, ROM achieved with difficulty' },
      ],
    },
    {
      id: 'rigidity_rue',
      text: '3.3b Rigidity - Right Upper Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight or detectable only when activated' },
        { value: 2, label: '2 = Mild to moderate' },
        { value: 3, label: '3 = Marked, but full ROM easily achieved' },
        { value: 4, label: '4 = Severe, ROM achieved with difficulty' },
      ],
    },
    {
      id: 'rigidity_lue',
      text: '3.3c Rigidity - Left Upper Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight or detectable only when activated' },
        { value: 2, label: '2 = Mild to moderate' },
        { value: 3, label: '3 = Marked, but full ROM easily achieved' },
        { value: 4, label: '4 = Severe, ROM achieved with difficulty' },
      ],
    },
    {
      id: 'rigidity_rle',
      text: '3.3d Rigidity - Right Lower Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight or detectable only when activated' },
        { value: 2, label: '2 = Mild to moderate' },
        { value: 3, label: '3 = Marked, but full ROM easily achieved' },
        { value: 4, label: '4 = Severe, ROM achieved with difficulty' },
      ],
    },
    {
      id: 'rigidity_lle',
      text: '3.3e Rigidity - Left Lower Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight or detectable only when activated' },
        { value: 2, label: '2 = Mild to moderate' },
        { value: 3, label: '3 = Marked, but full ROM easily achieved' },
        { value: 4, label: '4 = Severe, ROM achieved with difficulty' },
      ],
    },
    {
      id: 'finger_tapping_r',
      text: '3.4a Finger Tapping - Right Hand',
      type: 'select',
      required: true,
      helpText: 'Patient taps thumb with index finger rapidly and as big as possible. Rate each hand separately.',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'finger_tapping_l',
      text: '3.4b Finger Tapping - Left Hand',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'hand_movements_r',
      text: '3.5a Hand Movements - Right',
      type: 'select',
      required: true,
      helpText: 'Open and close hand rapidly, making a fist',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'hand_movements_l',
      text: '3.5b Hand Movements - Left',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'pronation_supination_r',
      text: '3.6a Pronation-Supination - Right',
      type: 'select',
      required: true,
      helpText: 'Pronate and supinate hand rapidly',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'pronation_supination_l',
      text: '3.6b Pronation-Supination - Left',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'toe_tapping_r',
      text: '3.7a Toe Tapping - Right',
      type: 'select',
      required: true,
      helpText: 'Place heel on ground and tap toes repeatedly',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'toe_tapping_l',
      text: '3.7b Toe Tapping - Left',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'leg_agility_r',
      text: '3.8a Leg Agility - Right',
      type: 'select',
      required: true,
      helpText: 'Rapidly stomp foot on ground',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'leg_agility_l',
      text: '3.8b Leg Agility - Left',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight: regular rhythm with one or two interruptions' },
        { value: 2, label: '2 = Mild: 3-5 interruptions with slow movement' },
        { value: 3, label: '3 = Moderate: more than 5 interruptions or occasional freezing' },
        { value: 4, label: '4 = Severe: cannot or can barely perform task' },
      ],
    },
    {
      id: 'arising_chair',
      text: '3.9 Arising from Chair',
      type: 'select',
      required: true,
      helpText: 'Patient attempts to rise from straight-backed chair with arms folded',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slow, or may need more than one attempt' },
        { value: 2, label: '2 = Pushes self up from arms of seat' },
        { value: 3, label: '3 = Tends to fall back; may have to try more than once' },
        { value: 4, label: '4 = Unable to rise without help' },
      ],
    },
    {
      id: 'gait',
      text: '3.10 Gait',
      type: 'select',
      required: true,
      helpText: 'Observe gait during walking',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Walks slowly, may shuffle with short steps' },
        { value: 2, label: '2 = Walks with difficulty but little or no assistance' },
        { value: 3, label: '3 = Severe disturbance, requires assistance' },
        { value: 4, label: '4 = Cannot walk at all, even with assistance' },
      ],
    },
    {
      id: 'freezing_gait',
      text: '3.11 Freezing of Gait',
      type: 'select',
      required: true,
      helpText: 'Observe for hesitation, freezing during gait',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Rare freezing when walking; may have start hesitation' },
        { value: 2, label: '2 = Occasional freezing when walking' },
        { value: 3, label: '3 = Frequent freezing, occasionally falls from freezing' },
        { value: 4, label: '4 = Frequent falls from freezing' },
      ],
    },
    {
      id: 'postural_stability',
      text: '3.12 Postural Stability',
      type: 'select',
      required: true,
      helpText: 'Response to sudden posterior displacement (pull test)',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Retropulsion, but recovers unaided' },
        { value: 2, label: '2 = Would fall if not caught by examiner' },
        { value: 3, label: '3 = Very unstable; tends to lose balance spontaneously' },
        { value: 4, label: '4 = Unable to stand without assistance' },
      ],
    },
    {
      id: 'posture',
      text: '3.13 Posture',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal erect' },
        { value: 1, label: '1 = Not quite erect, slightly stooped; could be normal for older person' },
        { value: 2, label: '2 = Moderately stooped, definitely abnormal' },
        { value: 3, label: '3 = Severely stooped with kyphosis' },
        { value: 4, label: '4 = Marked flexion with extreme abnormality of posture' },
      ],
    },
    {
      id: 'body_bradykinesia',
      text: '3.14 Global Spontaneity of Movement (Body Bradykinesia)',
      type: 'select',
      required: true,
      helpText: 'Overall impression of slowness and poverty of spontaneous movement',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Slight global slowness and poverty of spontaneous movements' },
        { value: 2, label: '2 = Mild global slowness and poverty of spontaneous movements' },
        { value: 3, label: '3 = Moderate global slowness and poverty of spontaneous movements' },
        { value: 4, label: '4 = Severe global slowness and poverty of spontaneous movements' },
      ],
    },
    {
      id: 'postural_tremor_r',
      text: '3.15a Postural Tremor - Right Hand',
      type: 'select',
      required: true,
      helpText: 'Arms extended in front of body',
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight; present with action' },
        { value: 2, label: '2 = Moderate; present with action' },
        { value: 3, label: '3 = Moderate; present at rest and action' },
        { value: 4, label: '4 = Marked; interferes with feeding' },
      ],
    },
    {
      id: 'postural_tremor_l',
      text: '3.15b Postural Tremor - Left Hand',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight; present with action' },
        { value: 2, label: '2 = Moderate; present with action' },
        { value: 3, label: '3 = Moderate; present at rest and action' },
        { value: 4, label: '4 = Marked; interferes with feeding' },
      ],
    },
    {
      id: 'kinetic_tremor_r',
      text: '3.16a Kinetic Tremor - Right Hand',
      type: 'select',
      required: true,
      helpText: 'Finger-to-nose testing',
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight; present with action' },
        { value: 2, label: '2 = Moderate; present with action' },
        { value: 3, label: '3 = Moderate; present at rest and action' },
        { value: 4, label: '4 = Marked; interferes with feeding' },
      ],
    },
    {
      id: 'kinetic_tremor_l',
      text: '3.16b Kinetic Tremor - Left Hand',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight; present with action' },
        { value: 2, label: '2 = Moderate; present with action' },
        { value: 3, label: '3 = Moderate; present at rest and action' },
        { value: 4, label: '4 = Marked; interferes with feeding' },
      ],
    },
    {
      id: 'rest_tremor_amplitude_rue',
      text: '3.17a Rest Tremor Amplitude - Right Upper Extremity',
      type: 'select',
      required: true,
      helpText: 'Amplitude of rest tremor',
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight: ≤1 cm amplitude' },
        { value: 2, label: '2 = Mild: 1-3 cm amplitude' },
        { value: 3, label: '3 = Moderate: 3-10 cm amplitude' },
        { value: 4, label: '4 = Severe: >10 cm amplitude' },
      ],
    },
    {
      id: 'rest_tremor_amplitude_lue',
      text: '3.17b Rest Tremor Amplitude - Left Upper Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight: ≤1 cm amplitude' },
        { value: 2, label: '2 = Mild: 1-3 cm amplitude' },
        { value: 3, label: '3 = Moderate: 3-10 cm amplitude' },
        { value: 4, label: '4 = Severe: >10 cm amplitude' },
      ],
    },
    {
      id: 'rest_tremor_amplitude_rle',
      text: '3.17c Rest Tremor Amplitude - Right Lower Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight: ≤1 cm amplitude' },
        { value: 2, label: '2 = Mild: 1-3 cm amplitude' },
        { value: 3, label: '3 = Moderate: 3-10 cm amplitude' },
        { value: 4, label: '4 = Severe: >10 cm amplitude' },
      ],
    },
    {
      id: 'rest_tremor_amplitude_lle',
      text: '3.17d Rest Tremor Amplitude - Left Lower Extremity',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight: ≤1 cm amplitude' },
        { value: 2, label: '2 = Mild: 1-3 cm amplitude' },
        { value: 3, label: '3 = Moderate: 3-10 cm amplitude' },
        { value: 4, label: '4 = Severe: >10 cm amplitude' },
      ],
    },
    {
      id: 'rest_tremor_amplitude_lip_jaw',
      text: '3.17e Rest Tremor Amplitude - Lip/Jaw',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Slight: ≤1 cm amplitude' },
        { value: 2, label: '2 = Mild: 1-3 cm amplitude' },
        { value: 3, label: '3 = Moderate: 3-10 cm amplitude' },
        { value: 4, label: '4 = Severe: >10 cm amplitude' },
      ],
    },
    {
      id: 'rest_tremor_constancy',
      text: '3.18 Constancy of Rest Tremor',
      type: 'select',
      required: true,
      helpText: 'Scored over entire examination',
      options: [
        { value: 0, label: '0 = Absent' },
        { value: 1, label: '1 = Tremor at rest present ≤25% of exam' },
        { value: 2, label: '2 = Tremor at rest present 26-50% of exam' },
        { value: 3, label: '3 = Tremor at rest present 51-75% of exam' },
        { value: 4, label: '4 = Tremor at rest present >75% of exam' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 10, interpretation: 'Minimal motor impairment', severity: 'minimal', color: '#10B981' },
    { min: 11, max: 25, interpretation: 'Mild motor impairment', severity: 'mild', color: '#84CC16', recommendations: ['Consider dopaminergic therapy if symptomatic', 'Physical therapy evaluation'] },
    { min: 26, max: 50, interpretation: 'Moderate motor impairment', severity: 'moderate', color: '#F59E0B', recommendations: ['Optimize dopaminergic therapy', 'Physical/occupational therapy', 'Consider advanced therapies if on optimal medical management'] },
    { min: 51, max: 80, interpretation: 'Moderately severe motor impairment', severity: 'moderately_severe', color: '#F97316', recommendations: ['Evaluate for DBS candidacy', 'Medication adjustment needed', 'Fall precautions'] },
    { min: 81, max: 132, interpretation: 'Severe motor impairment', severity: 'severe', color: '#EF4444', recommendations: ['Urgent movement disorder consultation', 'Consider palliative care involvement', 'Caregiver support'] },
  ],
  alerts: [
    {
      id: 'updrs-falls',
      condition: 'postural_stability >= 2',
      type: 'warning',
      message: 'Significant postural instability - high fall risk.',
      action: 'Implement fall precautions and PT referral',
    },
    {
      id: 'updrs-freezing',
      condition: 'freezing_gait >= 3',
      type: 'warning',
      message: 'Severe freezing of gait identified.',
      action: 'Consider gait training and cueing strategies',
    },
  ],
}

// ===========================================
// Hoehn & Yahr Scale - Parkinson's Disease Staging
// ===========================================
export const HOEHN_YAHR: ScaleDefinition = {
  id: 'hoehn_yahr',
  name: 'Hoehn & Yahr Scale',
  abbreviation: 'H&Y',
  description: 'Staging scale for Parkinson\'s disease progression. Exam-driven scale.',
  category: 'movement',
  timeToComplete: 2,
  source: 'Hoehn MM, Yahr MD. Parkinsonism: onset, progression and mortality. Neurology. 1967.',
  scoringMethod: 'custom',
  questions: [
    {
      id: 'stage',
      text: 'Hoehn & Yahr Stage',
      type: 'select',
      required: true,
      helpText: 'Select the stage that best describes the patient\'s current functional status',
      options: [
        { value: 0, label: '0 = No signs of disease' },
        { value: 1, label: '1 = Unilateral involvement only' },
        { value: 1.5, label: '1.5 = Unilateral and axial involvement' },
        { value: 2, label: '2 = Bilateral involvement without impairment of balance' },
        { value: 2.5, label: '2.5 = Mild bilateral disease with recovery on pull test' },
        { value: 3, label: '3 = Mild to moderate bilateral disease; some postural instability; physically independent' },
        { value: 4, label: '4 = Severe disability; still able to walk or stand unassisted' },
        { value: 5, label: '5 = Wheelchair bound or bedridden unless aided' },
      ],
    },
    {
      id: 'side_affected',
      text: 'Side Initially Affected (if applicable)',
      type: 'select',
      required: false,
      helpText: 'Which side showed symptoms first?',
      options: [
        { value: 0, label: 'Right side' },
        { value: 1, label: 'Left side' },
        { value: 2, label: 'Both sides simultaneously' },
        { value: 3, label: 'Unknown/Cannot determine' },
      ],
    },
    {
      id: 'predominant_symptoms',
      text: 'Predominant Symptom Type',
      type: 'select',
      required: false,
      helpText: 'What is the predominant motor phenotype?',
      options: [
        { value: 0, label: 'Tremor-dominant' },
        { value: 1, label: 'Akinetic-rigid (PIGD)' },
        { value: 2, label: 'Mixed' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 0, interpretation: 'Stage 0 - No signs of disease', severity: 'minimal', color: '#10B981' },
    { min: 1, max: 1.5, interpretation: 'Stage 1-1.5 - Unilateral disease', severity: 'mild', color: '#84CC16', recommendations: ['Consider MAO-B inhibitor or dopamine agonist', 'Exercise program'] },
    { min: 2, max: 2.5, interpretation: 'Stage 2-2.5 - Bilateral disease, balance intact', severity: 'moderate', color: '#F59E0B', recommendations: ['Levodopa therapy consideration', 'PT/OT evaluation', 'Speech therapy if dysarthria'] },
    { min: 3, max: 3, interpretation: 'Stage 3 - Postural instability, independent', severity: 'moderately_severe', color: '#F97316', recommendations: ['Fall precautions', 'Optimize medication', 'Consider advanced therapies'] },
    { min: 4, max: 5, interpretation: 'Stage 4-5 - Severe disability', severity: 'severe', color: '#EF4444', recommendations: ['Caregiver support', 'Home safety evaluation', 'Consider palliative care', 'Hospice if appropriate'] },
  ],
  alerts: [
    {
      id: 'hy-advanced',
      condition: 'stage >= 4',
      type: 'warning',
      message: 'Advanced Parkinson\'s disease - significant disability and care needs.',
      action: 'Assess caregiver burden and home safety',
    },
    {
      id: 'hy-postural',
      condition: 'stage >= 3',
      type: 'info',
      message: 'Postural instability present - increased fall risk.',
    },
  ],
}

// ===========================================
// EDSS - Expanded Disability Status Scale (MS)
// ===========================================
export const EDSS: ScaleDefinition = {
  id: 'edss',
  name: 'Expanded Disability Status Scale',
  abbreviation: 'EDSS',
  description: 'Quantifies disability in multiple sclerosis. Exam-driven scale that assesses functional systems.',
  category: 'other',
  timeToComplete: 20,
  source: 'Kurtzke JF. Rating neurologic impairment in multiple sclerosis: an expanded disability status scale (EDSS). Neurology. 1983.',
  scoringMethod: 'custom',
  questions: [
    {
      id: 'pyramidal',
      text: 'Pyramidal Functions',
      type: 'select',
      required: true,
      helpText: 'Motor function - weakness, spasticity',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Abnormal signs without disability' },
        { value: 2, label: '2 = Minimal disability' },
        { value: 3, label: '3 = Mild to moderate paraparesis or hemiparesis' },
        { value: 4, label: '4 = Marked paraparesis or hemiparesis' },
        { value: 5, label: '5 = Paraplegia or hemiplegia' },
        { value: 6, label: '6 = Quadriplegia' },
      ],
    },
    {
      id: 'cerebellar',
      text: 'Cerebellar Functions',
      type: 'select',
      required: true,
      helpText: 'Coordination, tremor, ataxia',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Abnormal signs without disability' },
        { value: 2, label: '2 = Mild ataxia' },
        { value: 3, label: '3 = Moderate truncal or limb ataxia' },
        { value: 4, label: '4 = Severe ataxia all limbs' },
        { value: 5, label: '5 = Unable to perform coordinated movements' },
      ],
    },
    {
      id: 'brainstem',
      text: 'Brain Stem Functions',
      type: 'select',
      required: true,
      helpText: 'Cranial nerve function, nystagmus, dysarthria, dysphagia',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Signs only' },
        { value: 2, label: '2 = Moderate nystagmus or mild disability' },
        { value: 3, label: '3 = Severe nystagmus, marked extraocular weakness, or moderate disability of other cranial nerves' },
        { value: 4, label: '4 = Marked dysarthria or marked disability' },
        { value: 5, label: '5 = Inability to swallow or speak' },
      ],
    },
    {
      id: 'sensory',
      text: 'Sensory Functions',
      type: 'select',
      required: true,
      helpText: 'Touch, pain, position sense, vibration',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Vibration or figure-writing decrease only in 1-2 limbs' },
        { value: 2, label: '2 = Mild decrease in touch or pain or position sense' },
        { value: 3, label: '3 = Moderate decrease in touch or pain or proprioception' },
        { value: 4, label: '4 = Marked decrease in touch or pain or proprioception below head' },
        { value: 5, label: '5 = Loss of sensation below head' },
        { value: 6, label: '6 = Loss of sensation below head plus loss in 1+ limbs' },
      ],
    },
    {
      id: 'bowel_bladder',
      text: 'Bowel and Bladder Functions',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Mild urinary hesitancy, urgency, or retention' },
        { value: 2, label: '2 = Moderate hesitancy, urgency, or urinary/fecal retention' },
        { value: 3, label: '3 = Frequent urinary incontinence' },
        { value: 4, label: '4 = Near constant catheterization needed' },
        { value: 5, label: '5 = Loss of bladder function' },
        { value: 6, label: '6 = Loss of bladder and bowel function' },
      ],
    },
    {
      id: 'visual',
      text: 'Visual Functions',
      type: 'select',
      required: true,
      helpText: 'Corrected visual acuity, scotoma, visual fields',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Scotoma with visual acuity (corrected) better than 20/30' },
        { value: 2, label: '2 = Worse eye with scotoma with VA 20/30-20/59' },
        { value: 3, label: '3 = Worse eye with large scotoma or moderate decrease in fields with VA 20/60-20/99' },
        { value: 4, label: '4 = Worse eye with marked decrease of fields with VA 20/100-20/200' },
        { value: 5, label: '5 = Worse eye with VA worse than 20/200; grade 3 plus better eye with VA 20/60 or less' },
        { value: 6, label: '6 = Grade 5 plus better eye with VA 20/60 or less' },
      ],
    },
    {
      id: 'cerebral',
      text: 'Cerebral (Mental) Functions',
      type: 'select',
      required: true,
      helpText: 'Mood, mentation, fatigue',
      options: [
        { value: 0, label: '0 = Normal' },
        { value: 1, label: '1 = Mood alteration only (depression)' },
        { value: 2, label: '2 = Mild decrease in mentation' },
        { value: 3, label: '3 = Moderate decrease in mentation' },
        { value: 4, label: '4 = Marked decrease in mentation' },
        { value: 5, label: '5 = Dementia or chronic brain syndrome, severe or incompetent' },
      ],
    },
    {
      id: 'ambulation',
      text: 'Ambulation Score',
      type: 'select',
      required: true,
      helpText: 'Walking ability - this drives the final EDSS score for scores >4.0',
      options: [
        { value: 0, label: '0 = Fully ambulatory' },
        { value: 1, label: '1 = Fully ambulatory; walks 300m without aid' },
        { value: 2, label: '2 = Fully ambulatory; walks 200m without aid' },
        { value: 3, label: '3 = Fully ambulatory; walks 100m without aid' },
        { value: 4, label: '4 = Walks 100m with unilateral support (cane)' },
        { value: 5, label: '5 = Walks 100m with bilateral support (crutches, walker)' },
        { value: 6, label: '6 = Walks <100m, uses wheelchair part of day' },
        { value: 7, label: '7 = Unable to walk >5m; essentially restricted to wheelchair' },
        { value: 8, label: '8 = Restricted to bed or chair; retains self-care functions' },
        { value: 9, label: '9 = Helpless bed patient; can communicate and eat' },
        { value: 10, label: '10 = Death due to MS' },
      ],
    },
    {
      id: 'edss_score',
      text: 'Final EDSS Score',
      type: 'select',
      required: true,
      helpText: 'Determined by functional system scores and ambulation',
      options: [
        { value: 0, label: '0.0 = Normal neurological exam' },
        { value: 1, label: '1.0 = No disability, minimal signs in one FS' },
        { value: 1.5, label: '1.5 = No disability, minimal signs in more than one FS' },
        { value: 2, label: '2.0 = Minimal disability in one FS' },
        { value: 2.5, label: '2.5 = Minimal disability in two FS' },
        { value: 3, label: '3.0 = Moderate disability in one FS, or mild disability in 3-4 FS; fully ambulatory' },
        { value: 3.5, label: '3.5 = Fully ambulatory but with moderate disability in one FS' },
        { value: 4, label: '4.0 = Fully ambulatory; able to walk without aid ≥500m' },
        { value: 4.5, label: '4.5 = Fully ambulatory; able to walk without aid ≥300m' },
        { value: 5, label: '5.0 = Ambulatory for about 200m without aid; disability impairs full daily activities' },
        { value: 5.5, label: '5.5 = Ambulatory for about 100m without aid; disability precludes full daily activities' },
        { value: 6, label: '6.0 = Intermittent or unilateral constant assistance (cane, crutch, brace) required to walk 100m' },
        { value: 6.5, label: '6.5 = Constant bilateral assistance required to walk 20m without resting' },
        { value: 7, label: '7.0 = Unable to walk >5m even with aid; essentially restricted to wheelchair' },
        { value: 7.5, label: '7.5 = Unable to take more than a few steps; restricted to wheelchair; may need aid for transfer' },
        { value: 8, label: '8.0 = Essentially restricted to bed, chair, or wheelchair; retains many self-care functions' },
        { value: 8.5, label: '8.5 = Essentially restricted to bed much of day; retains some self-care functions' },
        { value: 9, label: '9.0 = Helpless bed patient; can communicate and eat' },
        { value: 9.5, label: '9.5 = Totally helpless bed patient; unable to communicate or eat' },
        { value: 10, label: '10.0 = Death due to MS' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 1.5, interpretation: 'No or minimal disability', severity: 'minimal', color: '#10B981', recommendations: ['Continue disease-modifying therapy', 'Encourage exercise'] },
    { min: 2, max: 3.5, interpretation: 'Mild disability - Fully ambulatory', severity: 'mild', color: '#84CC16', recommendations: ['Consider higher-efficacy DMT if progression', 'PT evaluation'] },
    { min: 4, max: 5.5, interpretation: 'Moderate disability - Walking limited', severity: 'moderate', color: '#F59E0B', recommendations: ['Optimize DMT', 'PT/OT evaluation', 'Consider symptomatic treatments', 'Mobility aid evaluation'] },
    { min: 6, max: 6.5, interpretation: 'Requires walking aid', severity: 'moderately_severe', color: '#F97316', recommendations: ['Walking aid prescription', 'Home modification assessment', 'Consider progressive MS therapies'] },
    { min: 7, max: 10, interpretation: 'Severe disability - Wheelchair dependent or worse', severity: 'severe', color: '#EF4444', recommendations: ['Comprehensive care coordination', 'Wheelchair/seating evaluation', 'Caregiver support', 'Palliative care consideration'] },
  ],
  alerts: [
    {
      id: 'edss-rapid-progression',
      condition: 'edss_score >= 4',
      type: 'warning',
      message: 'EDSS ≥4.0 indicates significant walking limitation. Consider treatment optimization.',
    },
    {
      id: 'edss-severe',
      condition: 'edss_score >= 7',
      type: 'critical',
      message: 'Severe disability (wheelchair dependent). Ensure comprehensive support services.',
    },
  ],
}

// ===========================================
// CHA₂DS₂-VASc Score (Stroke Risk in AFib)
// ===========================================
export const CHA2DS2_VASC: ScaleDefinition = {
  id: 'cha2ds2_vasc',
  name: 'CHA₂DS₂-VASc Score',
  abbreviation: 'CHA₂DS₂-VASc',
  description: 'Estimates stroke risk in patients with atrial fibrillation to guide anticoagulation decisions. History-based scale.',
  category: 'other',
  timeToComplete: 2,
  source: 'Lip GY, et al. Refining clinical risk stratification for predicting stroke and thromboembolism in atrial fibrillation using a novel risk factor-based approach. Chest. 2010.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'chf',
      text: 'C - Congestive Heart Failure (or LV dysfunction)',
      type: 'select',
      required: true,
      helpText: 'History of CHF or objective evidence of moderate-severe LV dysfunction (EF ≤40%)',
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'hypertension',
      text: 'H - Hypertension',
      type: 'select',
      required: true,
      helpText: 'Resting BP >140/90 mmHg on at least 2 occasions or current antihypertensive treatment',
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'age_75',
      text: 'A₂ - Age ≥75 years',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 2, label: 'Yes (2 points)' },
      ],
    },
    {
      id: 'diabetes',
      text: 'D - Diabetes Mellitus',
      type: 'select',
      required: true,
      helpText: 'Fasting glucose >125 mg/dL or treatment with oral hypoglycemic agent and/or insulin',
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'stroke_tia',
      text: 'S₂ - Stroke/TIA/Thromboembolism history',
      type: 'select',
      required: true,
      helpText: 'Prior stroke, TIA, or systemic embolism',
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 2, label: 'Yes (2 points)' },
      ],
    },
    {
      id: 'vascular',
      text: 'V - Vascular Disease',
      type: 'select',
      required: true,
      helpText: 'Prior MI, peripheral artery disease, or aortic plaque',
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'age_65_74',
      text: 'A - Age 65-74 years',
      type: 'select',
      required: true,
      helpText: 'Only score if age 65-74 (not if already scored for ≥75)',
      options: [
        { value: 0, label: 'No (0 points)' },
        { value: 1, label: 'Yes (1 point)' },
      ],
    },
    {
      id: 'sex_female',
      text: 'Sc - Sex Category (Female)',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Male (0 points)' },
        { value: 1, label: 'Female (1 point)' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 0, interpretation: 'Low risk (0.2% annual stroke risk)', severity: 'minimal', color: '#10B981', recommendations: ['No anticoagulation recommended', 'May consider aspirin or no therapy'] },
    { min: 1, max: 1, interpretation: 'Low-moderate risk (0.6% annual stroke risk)', severity: 'mild', color: '#84CC16', recommendations: ['Consider oral anticoagulation or aspirin', 'Males with score of 1: anticoagulation preferred', 'Females with only 1 point (sex): consider risk-benefit'] },
    { min: 2, max: 3, interpretation: 'Moderate risk (2.2-3.2% annual stroke risk)', severity: 'moderate', color: '#F59E0B', recommendations: ['Oral anticoagulation recommended', 'Prefer NOACs over warfarin unless contraindicated'] },
    { min: 4, max: 5, interpretation: 'Moderate-high risk (4.8-6.7% annual stroke risk)', severity: 'moderately_severe', color: '#F97316', recommendations: ['Oral anticoagulation strongly recommended', 'NOAC preferred', 'Assess bleeding risk with HAS-BLED'] },
    { min: 6, max: 9, interpretation: 'High risk (7.2-15.2% annual stroke risk)', severity: 'severe', color: '#EF4444', recommendations: ['Oral anticoagulation mandatory unless contraindicated', 'NOAC strongly preferred', 'Close monitoring for bleeding', 'Consider LAA closure if cannot anticoagulate'] },
  ],
  alerts: [
    {
      id: 'cha2ds2-high',
      condition: 'score >= 2',
      type: 'warning',
      message: 'Anticoagulation recommended for stroke prevention.',
      action: 'Discuss anticoagulation options with patient',
    },
    {
      id: 'cha2ds2-very-high',
      condition: 'score >= 6',
      type: 'critical',
      message: 'Very high stroke risk. Ensure patient is on anticoagulation.',
      action: 'Verify anticoagulation status and compliance',
    },
  ],
}

// ===========================================
// ISI - Insomnia Severity Index
// ===========================================
export const ISI: ScaleDefinition = {
  id: 'isi',
  name: 'Insomnia Severity Index',
  abbreviation: 'ISI',
  description: 'Self-report measure of insomnia severity. History-based scale.',
  category: 'sleep',
  timeToComplete: 3,
  source: 'Morin CM. Insomnia: Psychological assessment and management. New York: Guilford Press. 1993.',
  scoringMethod: 'sum',
  questions: [
    {
      id: 'difficulty_falling',
      text: 'Difficulty falling asleep',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'None (0)' },
        { value: 1, label: 'Mild (1)' },
        { value: 2, label: 'Moderate (2)' },
        { value: 3, label: 'Severe (3)' },
        { value: 4, label: 'Very Severe (4)' },
      ],
    },
    {
      id: 'difficulty_staying',
      text: 'Difficulty staying asleep',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'None (0)' },
        { value: 1, label: 'Mild (1)' },
        { value: 2, label: 'Moderate (2)' },
        { value: 3, label: 'Severe (3)' },
        { value: 4, label: 'Very Severe (4)' },
      ],
    },
    {
      id: 'early_waking',
      text: 'Problems waking up too early',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'None (0)' },
        { value: 1, label: 'Mild (1)' },
        { value: 2, label: 'Moderate (2)' },
        { value: 3, label: 'Severe (3)' },
        { value: 4, label: 'Very Severe (4)' },
      ],
    },
    {
      id: 'satisfaction',
      text: 'How satisfied/dissatisfied are you with your current sleep pattern?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Very Satisfied (0)' },
        { value: 1, label: 'Satisfied (1)' },
        { value: 2, label: 'Moderately Satisfied (2)' },
        { value: 3, label: 'Dissatisfied (3)' },
        { value: 4, label: 'Very Dissatisfied (4)' },
      ],
    },
    {
      id: 'noticeable',
      text: 'How noticeable to others is your sleep problem in terms of impairing your daily functioning?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all Noticeable (0)' },
        { value: 1, label: 'A Little (1)' },
        { value: 2, label: 'Somewhat (2)' },
        { value: 3, label: 'Much (3)' },
        { value: 4, label: 'Very Much Noticeable (4)' },
      ],
    },
    {
      id: 'worried',
      text: 'How worried/distressed are you about your current sleep problem?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all Worried (0)' },
        { value: 1, label: 'A Little (1)' },
        { value: 2, label: 'Somewhat (2)' },
        { value: 3, label: 'Much (3)' },
        { value: 4, label: 'Very Much Worried (4)' },
      ],
    },
    {
      id: 'interfering',
      text: 'To what extent is your sleep problem interfering with daily functioning?',
      type: 'select',
      required: true,
      options: [
        { value: 0, label: 'Not at all Interfering (0)' },
        { value: 1, label: 'A Little (1)' },
        { value: 2, label: 'Somewhat (2)' },
        { value: 3, label: 'Much (3)' },
        { value: 4, label: 'Very Much Interfering (4)' },
      ],
    },
  ],
  scoringRanges: [
    { min: 0, max: 7, interpretation: 'No clinically significant insomnia', severity: 'minimal', color: '#10B981' },
    { min: 8, max: 14, interpretation: 'Subthreshold insomnia', severity: 'mild', color: '#84CC16', recommendations: ['Sleep hygiene education', 'Consider follow-up assessment'] },
    { min: 15, max: 21, interpretation: 'Clinical insomnia (moderate)', severity: 'moderate', color: '#F59E0B', recommendations: ['CBT-I referral recommended', 'Consider short-term sleep aid'] },
    { min: 22, max: 28, interpretation: 'Clinical insomnia (severe)', severity: 'severe', color: '#EF4444', recommendations: ['Urgent sleep medicine referral', 'CBT-I first-line treatment', 'Assess for comorbid conditions'] },
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
  nihss: NIHSS,
  modified_ashworth: MODIFIED_ASHWORTH,
  abcd2: ABCD2,
  dhi: DHI,
  mini_cog: MINI_COG,
  isi: ISI,
  updrs_motor: UPDRS_MOTOR,
  hoehn_yahr: HOEHN_YAHR,
  edss: EDSS,
  cha2ds2_vasc: CHA2DS2_VASC,
}

// Helper to categorize scales by type (exam-driven vs history-based)
export type ScaleLocationType = 'exam' | 'history'

export const SCALE_LOCATION_MAP: Record<string, ScaleLocationType> = {
  // Exam-driven scales (require physical assessment, MA can assist)
  nihss: 'exam',
  modified_ashworth: 'exam',
  moca: 'exam', // Requires patient interaction but can be done via telemedicine
  mini_cog: 'exam',
  updrs_motor: 'exam', // Motor exam for Parkinson's - can be done with MA assistance
  hoehn_yahr: 'exam', // Staging requires observation of patient
  edss: 'exam', // MS disability scale - requires full neurological exam

  // History-based scales (self-report, can be completed by patient)
  phq9: 'history',
  gad7: 'history',
  midas: 'history',
  hit6: 'history',
  ess: 'history',
  abcd2: 'history',
  dhi: 'history',
  isi: 'history',
  cha2ds2_vasc: 'history', // Risk calculation from medical history
}

export function getScaleLocation(scaleId: string): ScaleLocationType {
  return SCALE_LOCATION_MAP[scaleId] || 'history'
}

export function getExamScales(): ScaleDefinition[] {
  return Object.entries(SCALE_LOCATION_MAP)
    .filter(([, location]) => location === 'exam')
    .map(([id]) => ALL_SCALES[id])
    .filter(Boolean)
}

export function getHistoryScales(): ScaleDefinition[] {
  return Object.entries(SCALE_LOCATION_MAP)
    .filter(([, location]) => location === 'history')
    .map(([id]) => ALL_SCALES[id])
    .filter(Boolean)
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
  { condition: 'Parkinson disease', scaleId: 'updrs_motor', priority: 1, isRequired: false },
  { condition: 'Parkinson disease', scaleId: 'hoehn_yahr', priority: 2, isRequired: false },
  { condition: 'Parkinson disease', scaleId: 'moca', priority: 3, isRequired: false },
  { condition: 'Parkinson disease', scaleId: 'phq9', priority: 4, isRequired: false },
  { condition: 'Parkinson disease', scaleId: 'ess', priority: 5, isRequired: false },

  { condition: 'Parkinsonism', scaleId: 'updrs_motor', priority: 1, isRequired: false },
  { condition: 'Parkinsonism', scaleId: 'hoehn_yahr', priority: 2, isRequired: false },
  { condition: 'Parkinsonism', scaleId: 'moca', priority: 3, isRequired: false },

  { condition: 'Essential tremor', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Essential tremor', scaleId: 'gad7', priority: 2, isRequired: false },

  { condition: 'Restless legs syndrome', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'Restless legs syndrome', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Huntington disease', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Huntington disease', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Dystonia', scaleId: 'phq9', priority: 1, isRequired: false },

  { condition: 'Progressive supranuclear palsy', scaleId: 'hoehn_yahr', priority: 1, isRequired: false },
  { condition: 'Progressive supranuclear palsy', scaleId: 'moca', priority: 2, isRequired: false },

  { condition: 'Multiple system atrophy', scaleId: 'hoehn_yahr', priority: 1, isRequired: false },
  { condition: 'Multiple system atrophy', scaleId: 'moca', priority: 2, isRequired: false },

  // Epilepsy & Seizures
  { condition: 'Epilepsy', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Epilepsy', scaleId: 'ess', priority: 2, isRequired: false },
  { condition: 'Epilepsy', scaleId: 'gad7', priority: 3, isRequired: false },

  { condition: 'New onset seizure', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'New onset seizure', scaleId: 'moca', priority: 2, isRequired: false },

  { condition: 'Breakthrough seizures', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Breakthrough seizures', scaleId: 'ess', priority: 2, isRequired: false },

  // Dementia & Cognitive
  { condition: 'Memory loss', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Memory loss', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Mild cognitive impairment', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Mild cognitive impairment', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Alzheimer disease', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Alzheimer disease', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Dementia evaluation', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Dementia evaluation', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Frontotemporal dementia', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Frontotemporal dementia', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Lewy body dementia', scaleId: 'moca', priority: 1, isRequired: false },
  { condition: 'Lewy body dementia', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Lewy body dementia', scaleId: 'ess', priority: 3, isRequired: false },

  // Neuromuscular
  { condition: 'Peripheral neuropathy', scaleId: 'phq9', priority: 1, isRequired: false },

  { condition: 'Myasthenia gravis', scaleId: 'phq9', priority: 1, isRequired: false },

  { condition: 'ALS/Motor neuron disease', scaleId: 'phq9', priority: 1, isRequired: false },

  // MS & Neuroimmunology
  { condition: 'Multiple sclerosis', scaleId: 'edss', priority: 1, isRequired: false },
  { condition: 'Multiple sclerosis', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Multiple sclerosis', scaleId: 'moca', priority: 3, isRequired: false },
  { condition: 'Multiple sclerosis', scaleId: 'ess', priority: 4, isRequired: false },

  { condition: 'MS follow-up', scaleId: 'edss', priority: 1, isRequired: false },
  { condition: 'MS follow-up', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'MS follow-up', scaleId: 'moca', priority: 3, isRequired: false },

  { condition: 'Neuromyelitis optica', scaleId: 'edss', priority: 1, isRequired: false },
  { condition: 'Neuromyelitis optica', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'MS relapse', scaleId: 'edss', priority: 1, isRequired: false },

  { condition: 'Clinically isolated syndrome', scaleId: 'edss', priority: 1, isRequired: false },
  { condition: 'Clinically isolated syndrome', scaleId: 'phq9', priority: 2, isRequired: false },

  // Sleep
  { condition: 'Narcolepsy', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'Narcolepsy', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Insomnia', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'Insomnia', scaleId: 'phq9', priority: 2, isRequired: false },
  { condition: 'Insomnia', scaleId: 'gad7', priority: 3, isRequired: false },

  { condition: 'Sleep apnea evaluation', scaleId: 'ess', priority: 1, isRequired: false },
  { condition: 'Sleep apnea evaluation', scaleId: 'phq9', priority: 2, isRequired: false },

  // Other Common
  { condition: 'Dizziness/Vertigo', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Dizziness/Vertigo', scaleId: 'gad7', priority: 2, isRequired: false },

  { condition: 'Concussion/Post-concussion syndrome', scaleId: 'phq9', priority: 1, isRequired: false },
  { condition: 'Concussion/Post-concussion syndrome', scaleId: 'moca', priority: 2, isRequired: false },
  { condition: 'Concussion/Post-concussion syndrome', scaleId: 'hit6', priority: 3, isRequired: false },

  { condition: 'Stroke follow-up', scaleId: 'nihss', priority: 1, isRequired: false },
  { condition: 'Stroke follow-up', scaleId: 'moca', priority: 2, isRequired: false },
  { condition: 'Stroke follow-up', scaleId: 'phq9', priority: 3, isRequired: false },
  { condition: 'Stroke follow-up', scaleId: 'modified_ashworth', priority: 4, isRequired: false },

  { condition: 'TIA evaluation', scaleId: 'abcd2', priority: 1, isRequired: false },
  { condition: 'TIA evaluation', scaleId: 'nihss', priority: 2, isRequired: false },
  { condition: 'TIA evaluation', scaleId: 'moca', priority: 3, isRequired: false },
  { condition: 'TIA evaluation', scaleId: 'phq9', priority: 4, isRequired: false },

  // Acute Stroke
  { condition: 'Acute stroke', scaleId: 'nihss', priority: 1, isRequired: false },
  { condition: 'Acute stroke', scaleId: 'moca', priority: 2, isRequired: false },

  { condition: 'Stroke - ischemic', scaleId: 'nihss', priority: 1, isRequired: false },
  { condition: 'Stroke - ischemic', scaleId: 'moca', priority: 2, isRequired: false },
  { condition: 'Stroke - ischemic', scaleId: 'modified_ashworth', priority: 3, isRequired: false },

  { condition: 'Stroke - hemorrhagic', scaleId: 'nihss', priority: 1, isRequired: false },
  { condition: 'Stroke - hemorrhagic', scaleId: 'moca', priority: 2, isRequired: false },

  // Dizziness/Vertigo - Add DHI
  { condition: 'Dizziness/Vertigo', scaleId: 'dhi', priority: 1, isRequired: false },

  // Spasticity conditions
  { condition: 'Spasticity', scaleId: 'modified_ashworth', priority: 1, isRequired: false },

  // Update Insomnia to include ISI
  { condition: 'Insomnia', scaleId: 'isi', priority: 1, isRequired: false },

  // Atrial Fibrillation and Stroke Risk
  { condition: 'Atrial fibrillation', scaleId: 'cha2ds2_vasc', priority: 1, isRequired: false },
  { condition: 'Atrial fibrillation', scaleId: 'phq9', priority: 2, isRequired: false },

  { condition: 'Atrial flutter', scaleId: 'cha2ds2_vasc', priority: 1, isRequired: false },

  { condition: 'Cardioembolic stroke', scaleId: 'cha2ds2_vasc', priority: 1, isRequired: false },
  { condition: 'Cardioembolic stroke', scaleId: 'nihss', priority: 2, isRequired: false },
  { condition: 'Cardioembolic stroke', scaleId: 'moca', priority: 3, isRequired: false },

  { condition: 'Cryptogenic stroke', scaleId: 'cha2ds2_vasc', priority: 1, isRequired: false },
  { condition: 'Cryptogenic stroke', scaleId: 'nihss', priority: 2, isRequired: false },
  { condition: 'Cryptogenic stroke', scaleId: 'moca', priority: 3, isRequired: false },

  // Stroke follow-up with spasticity
  { condition: 'Post-stroke spasticity', scaleId: 'modified_ashworth', priority: 1, isRequired: false },
  { condition: 'Post-stroke spasticity', scaleId: 'nihss', priority: 2, isRequired: false },
  { condition: 'Post-stroke spasticity', scaleId: 'moca', priority: 3, isRequired: false },
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
