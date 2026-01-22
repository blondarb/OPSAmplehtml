import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Default neurology phrases to seed for new users
const DEFAULT_PHRASES = [
  // Physical Exam - scope: hpi (exam findings often in HPI)
  {
    trigger_text: '.neuroexam',
    expansion_text: 'Mental status: Alert and oriented x3, appropriate affect, normal attention and concentration. Speech fluent without dysarthria. Cranial nerves II-XII intact. Motor: 5/5 strength in all extremities, normal bulk and tone. Sensory: Intact to light touch, pinprick, vibration, and proprioception. Reflexes: 2+ and symmetric throughout. Coordination: Normal finger-to-nose and heel-to-shin. Gait: Normal, tandem intact.',
    category: 'Physical Exam',
    description: 'Complete normal neurological examination',
    scope: 'hpi'
  },
  {
    trigger_text: '.wnl',
    expansion_text: 'Within normal limits',
    category: 'General',
    description: 'Quick normal finding',
    scope: 'global'
  },
  {
    trigger_text: '.nfnd',
    expansion_text: 'No focal neurological deficits',
    category: 'Physical Exam',
    description: 'No focal deficits',
    scope: 'hpi'
  },
  // Review of Systems - scope: ros
  {
    trigger_text: '.rosneg',
    expansion_text: 'Constitutional: Denies fever, chills, weight loss, fatigue. HEENT: Denies vision changes, hearing loss, tinnitus. Cardiovascular: Denies chest pain, palpitations. Respiratory: Denies shortness of breath, cough. GI: Denies nausea, vomiting, abdominal pain. Neurological: See HPI.',
    category: 'ROS',
    description: 'Negative review of systems',
    scope: 'ros'
  },
  {
    trigger_text: '.deny',
    expansion_text: 'Patient denies any recent changes in symptoms, new symptoms, or concerning features.',
    category: 'General',
    description: 'General denial statement',
    scope: 'global'
  },
  // Allergies - scope: allergies
  {
    trigger_text: '.nkda',
    expansion_text: 'No known drug allergies',
    category: 'Allergies',
    description: 'No known allergies',
    scope: 'allergies'
  },
  // Headache/Migraine - Assessment scope
  {
    trigger_text: '.migraine',
    expansion_text: 'Chronic migraine without aura. Patient reports [X] headache days per month. Current preventive therapy: [medication]. Acute therapy: [medication]. MIDAS score: [X]. HIT-6 score: [X].',
    category: 'Assessment',
    description: 'Migraine assessment template',
    scope: 'assessment'
  },
  {
    trigger_text: '.haplan',
    expansion_text: `Plan:
1. Continue current preventive therapy
2. Acute treatment: Use at headache onset, limit to 2 days/week to prevent medication overuse
3. Lifestyle modifications: Regular sleep schedule, hydration, stress management
4. Headache diary to track frequency and triggers
5. Follow up in [X] weeks/months`,
    category: 'Plan',
    description: 'Headache management plan',
    scope: 'plan'
  },
  // Seizure - Assessment scope
  {
    trigger_text: '.seizure',
    expansion_text: 'Epilepsy, [type]. Last seizure: [date]. Current AED: [medication] [dose]. Seizure frequency: [X] per [timeframe]. Adherence: [status]. Last AED level: [value] on [date].',
    category: 'Assessment',
    description: 'Seizure assessment template',
    scope: 'assessment'
  },
  // General Plans - scope: plan
  {
    trigger_text: '.fu1mo',
    expansion_text: 'Follow up in 1 month or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'One month follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.fu3mo',
    expansion_text: 'Follow up in 3 months or sooner if symptoms worsen.',
    category: 'Plan',
    description: 'Three month follow-up',
    scope: 'plan'
  },
  {
    trigger_text: '.labs',
    expansion_text: 'Labs ordered: CBC, CMP, [additional tests]. Results to be reviewed at next visit.',
    category: 'Plan',
    description: 'Lab order template',
    scope: 'plan'
  },
  {
    trigger_text: '.mri',
    expansion_text: 'MRI brain [with/without contrast] ordered to evaluate [indication]. Results to be reviewed and discussed.',
    category: 'Plan',
    description: 'MRI order template',
    scope: 'plan'
  },
  // Patient Education - global
  {
    trigger_text: '.educated',
    expansion_text: 'Patient educated on diagnosis, treatment options, and expected outcomes. Questions answered. Patient verbalized understanding and agrees with plan.',
    category: 'General',
    description: 'Patient education statement',
    scope: 'global'
  }
]

// POST /api/phrases/seed - Seed default phrases for current user
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user already has phrases
  const { data: existing } = await supabase
    .from('dot_phrases')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { message: 'User already has phrases', seeded: false },
      { status: 200 }
    )
  }

  // Insert default phrases
  const phrasesToInsert = DEFAULT_PHRASES.map(phrase => ({
    ...phrase,
    user_id: user.id
  }))

  const { data: phrases, error } = await supabase
    .from('dot_phrases')
    .insert(phrasesToInsert)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Default phrases seeded successfully',
    seeded: true,
    count: phrases?.length || 0
  }, { status: 201 })
}
