/**
 * Demo personas for the Neuro Intake Engine (/consult) pipeline.
 *
 * Each persona provides:
 *  - A realistic pre-written referral that passes triage with signal.
 *  - An "actor briefing" so whoever is playing the patient during the
 *    AI Historian voice interview knows the role — without being scripted.
 *
 * The briefings are deliberately flexible: demeanor + optional facts, not
 * a script. The Historian is a live AI and adapts to whatever the actor
 * chooses to share (or not).
 *
 * These are distinct from `src/lib/triage/demoScenarios.ts` which are
 * full PDF-backed scenarios used on the standalone /triage page.
 */

export interface SamplePersonaBriefing {
  demeanor: string
  openingCue: string
  keyFacts: string[]
  optionalColor: string[]
}

export interface SamplePersona {
  id: string
  name: string
  age: number
  sex: 'M' | 'F'
  occupation: string
  headline: string
  subspecialty:
    | 'Headache'
    | 'Movement Disorders'
    | 'General Neurology'
    | 'Epilepsy'
    | 'Neuromuscular'
  accentColor: string
  accentBg: string
  referralText: string
  briefing: SamplePersonaBriefing
}

export const SAMPLE_PERSONAS: SamplePersona[] = [
  {
    id: 'maya-torres',
    name: 'Maya Torres',
    age: 34,
    sex: 'F',
    occupation: 'Marketing director',
    headline: 'Episodic migraine with aura',
    subspecialty: 'Headache',
    accentColor: '#F472B6',
    accentBg: 'rgba(244, 114, 182, 0.12)',
    referralText:
      '34-year-old female with 3-year history of episodic headaches, now 4 to 6 per month. Throbbing, right-sided, associated with photophobia, phonophobia, and nausea. Preceded by visual scintillations for ~30 minutes in roughly half the episodes. Triggered by sleep deprivation and stress. Mother with similar headaches. Failed OTC analgesics and a trial of propranolol. No focal deficits on PCP exam. Referred to Headache clinic for consideration of CGRP therapy.',
    briefing: {
      demeanor:
        'Articulate and detail-oriented. You want answers and you will describe things precisely when asked. Professional but a little worn down by the headaches.',
      openingCue:
        'When the AI asks why you\'re here, something like: "I\'ve been getting really bad headaches every week for a few years now, and nothing I\'ve tried is really working."',
      keyFacts: [
        'Right-sided throbbing, 4–6 times a month, usually lasts most of a day',
        'Visual zig-zags / flashing lights ~30 minutes before roughly half of them',
        'Light and noise make it unbearable, sometimes you throw up',
        'Your mom had migraines too — she outgrew them in her 50s',
        'Sleep is inconsistent (you run a team), and you drink a lot of coffee',
        'Propranolol made you tired so you stopped after a few weeks',
      ],
      optionalColor: [
        'You just got promoted 6 months ago — stress has spiked',
        'You worry it could be something worse (you Google a lot)',
        'You\'ve tried acupuncture; it helped a little',
      ],
    },
  },
  {
    id: 'walter-henderson',
    name: 'Walter Henderson',
    age: 72,
    sex: 'M',
    occupation: 'Retired machinist',
    headline: 'Progressive hand tremor — likely essential tremor',
    subspecialty: 'Movement Disorders',
    accentColor: '#60A5FA',
    accentBg: 'rgba(96, 165, 250, 0.12)',
    referralText:
      '72-year-old male referred for bilateral hand tremor, progressive over 2 to 3 years. Patient minimizes symptoms — family reports spilling liquids, changes in handwriting, and difficulty with utensils. No rigidity, bradykinesia, or gait abnormality noted on PCP exam. Father had a similar lifelong tremor. Currently on amlodipine and simvastatin. Referred to Movement Disorders to distinguish essential tremor from early Parkinsonism.',
    briefing: {
      demeanor:
        'Gruff, laconic, downplays everything. You wouldn\'t be here if your wife hadn\'t dragged you in. Give short answers. Let the AI ask follow-ups — that\'s the whole point of the demo.',
      openingCue:
        'Something like: "My wife thinks I have a tremor. I think it\'s fine. She made the appointment."',
      keyFacts: [
        'Hands shake most when you\'re reaching for something — not when they\'re at rest',
        'Handwriting has gotten smaller and shakier — you stopped signing checks',
        'You spill soup, coffee cups tremble — embarrassing but you cope',
        'Your father had this exact same shake his whole life',
        'A beer or two actually makes it better (you\'ve noticed)',
        'You haven\'t fallen, walk fine, smell is fine',
      ],
      optionalColor: [
        'Coffee makes it worse — you cut back',
        'You used to do fine-machining work — now you couldn\'t',
        'Your wife noticed first, maybe 3 years ago at your granddaughter\'s wedding',
      ],
    },
  },
  {
    id: 'priya-ramanathan',
    name: 'Priya Ramanathan',
    age: 28,
    sex: 'F',
    occupation: 'Software engineer',
    headline: 'Transient optic symptoms + ascending numbness',
    subspecialty: 'General Neurology',
    accentColor: '#8B5CF6',
    accentBg: 'rgba(139, 92, 246, 0.12)',
    referralText:
      '28-year-old female with a 2-week history of right leg numbness ascending from the foot to just above the waist, worse after hot showers. One month ago, she had 10 days of blurred vision in the left eye with pain on eye movement, which resolved spontaneously. No trauma, no prior neurologic events. Sister with Hashimoto\'s thyroiditis. Referred urgently to Neurology to evaluate for a demyelinating process.',
    briefing: {
      demeanor:
        'Anxious, articulate, a little overwhelmed. You\'ve been Googling. You ask the AI questions back sometimes. Fast-talking under stress.',
      openingCue:
        'Something like: "My leg has been numb for two weeks and it\'s getting bigger, and I\'m kind of scared because last month my eye went blurry too."',
      keyFacts: [
        'Right leg numbness started at the foot, crept up to around your belly button',
        'Numbness gets noticeably worse after a hot shower — you figured that out',
        'Last month, left eye blurry for ~10 days with pain moving it, resolved on its own',
        'When you bend your neck forward, you sometimes get an electric zing down your spine',
        'You\'re tired in a way that doesn\'t make sense — naps don\'t fix it',
        'Your sister has Hashimoto\'s; you\'ve read about autoimmune things',
      ],
      optionalColor: [
        'You took a red-eye flight last night and you\'re running on fumes',
        'You\'re not sure if you should be driving — it worries you',
        'You didn\'t tell your eye doctor about the leg thing; now you feel dumb',
      ],
    },
  },
  {
    id: 'darnell-wilson',
    name: 'Darnell Wilson',
    age: 58,
    sex: 'M',
    occupation: 'Bus dispatcher',
    headline: '"Feeling off" — vague multi-symptom presentation',
    subspecialty: 'General Neurology',
    accentColor: '#F59E0B',
    accentBg: 'rgba(245, 158, 11, 0.12)',
    referralText:
      '58-year-old male referred for evaluation of "feeling off." Family reports hand shaking, occasional word-finding difficulty, and slower pace over the last several months. Patient uncertain about timeline. One possible fall. No clear acute event. PCP exam unremarkable. Referred to Neurology to build a timeline and assess.',
    briefing: {
      demeanor:
        'Very vague. You don\'t remember dates. You shrug a lot. This is the demo that shows the AI pulling order out of chaos — so stay fuzzy and let it dig. "I don\'t know" is a great answer.',
      openingCue:
        'Something like: "My wife said I should come. I don\'t know. I\'ve just been feeling off. Something\'s not right, but I couldn\'t tell you when it started."',
      keyFacts: [
        'Maybe 6 months? Maybe 8? You really can\'t say exactly',
        'Hands tremble sometimes — you\'re not sure when or which one',
        'You lose words mid-sentence. Not often. Maybe.',
        'You fell once — stepping off a curb — no injury — you don\'t talk about it',
        'Sleep has been terrible since your daughter got sick',
        'Your wife does most of the remembering for both of you now',
      ],
      optionalColor: [
        'You\'re embarrassed to be here and you\'ll show it',
        'When pushed, you might remember dropping a coffee cup',
        'You haven\'t told anyone you get confused coming home from work sometimes',
      ],
    },
  },
  {
    id: 'rachel-cho',
    name: 'Rachel Cho',
    age: 22,
    sex: 'F',
    occupation: 'College senior, psychology major',
    headline: 'Witnessed spells — possible new-onset seizures',
    subspecialty: 'Epilepsy',
    accentColor: '#22D3EE',
    accentBg: 'rgba(34, 211, 238, 0.12)',
    referralText:
      '22-year-old female with 3 witnessed episodes over 6 months: unresponsiveness lasting 1 to 2 minutes with lip-smacking and right-hand fumbling, followed by postictal confusion for 10 to 15 minutes. Patient has no memory of the episodes themselves. Once bit the side of her tongue. Episodes clustered around exam periods. No prior seizure history; no family history. Referred to Epilepsy clinic.',
    briefing: {
      demeanor:
        'Young, a little embarrassed, uncertain. You don\'t remember the spells themselves — only what your friends tell you afterward. Say "I don\'t know, my roommate said..." a lot.',
      openingCue:
        'Something like: "My roommate keeps telling me I zone out and do weird things, and then I don\'t remember any of it. It\'s happened a few times."',
      keyFacts: [
        '3 episodes in 6 months, always during or just after finals weeks',
        'Your roommate says you stare, smack your lips, fumble with your right hand',
        'You come back and feel exhausted and confused — then you usually sleep hard',
        'Once you woke up with the side of your tongue sore and bloody',
        'Twice before an episode, you had this weird déjà vu feeling — then nothing',
        'You\'re running on 4 hours of sleep and a lot of Red Bull',
      ],
      optionalColor: [
        'You\'re graduating in 3 months and you\'re worried about driving',
        'Your parents don\'t know yet — you haven\'t told them',
        'You Googled "absence seizures" once and closed the tab',
      ],
    },
  },
]

export function getPersonaById(id: string | null | undefined): SamplePersona | null {
  if (!id) return null
  return SAMPLE_PERSONAS.find((p) => p.id === id) ?? null
}
