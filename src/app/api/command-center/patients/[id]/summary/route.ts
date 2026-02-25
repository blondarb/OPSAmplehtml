import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PatientSummaryResponse } from '@/lib/command-center/types'

// ─── Detailed patient summaries ─────────────────────────────────────────────
// Rich summaries for the first 6 patients (urgent + attention tiers).
// Remaining patients receive a template-generated summary.

const DETAILED_SUMMARIES: Record<string, PatientSummaryResponse> = {
  'p-1': {
    ai_summary:
      "Maria Santos is a 68-year-old woman with Parkinson's Disease who has shown progressive tremor worsening over the past 2 weeks. Wearable monitoring detected a 40% increase in tremor scores and 2 fall events within 9 days. Her carbidopa-levodopa refill is due in 3 days. An MRI Brain ordered 18 days ago has no report on file. MoCA screening is overdue (last administered 8 months ago). Physical therapy referral should be prioritized given the fall history.",
    pending_items: [
      {
        category: 'wearables',
        description: 'Tremor score increased 40% over last 7 days',
        age: 'ongoing',
      },
      {
        category: 'wearables',
        description: '2 fall events detected in 9 days',
        age: '2 days ago',
      },
      {
        category: 'refills',
        description: 'Carbidopa-levodopa refill due in 3 days',
        age: 'due Feb 28',
      },
      {
        category: 'results',
        description: 'MRI Brain ordered 18 days ago — no report received',
        age: '18 days',
      },
      {
        category: 'scales',
        description: 'MoCA due (last administered 8 months ago)',
        age: 'overdue',
      },
    ],
    recent_events: [
      {
        date: '2026-02-23',
        event: 'Wearable alert: fall detected',
        source: 'wearable',
      },
      {
        date: '2026-02-22',
        event: 'Wearable alert: tremor score spike',
        source: 'wearable',
      },
      {
        date: '2026-02-20',
        event: 'Office visit — routine follow-up',
        source: 'sevaro',
      },
      {
        date: '2026-02-18',
        event: 'Lab result: CBC within normal limits',
        source: 'ehr',
      },
    ],
    quick_links: {
      chart: '/physician?patient=p-1',
      wearable: '/wearable?patient=p-1',
      followup: '/follow-up?patient=p-1',
    },
  },

  'p-2': {
    ai_summary:
      'James Okonkwo is a 34-year-old man with Epilepsy (focal onset, aware) who reported a breakthrough seizure 2 days ago after 4 months seizure-free. He is currently on levetiracetam 1500 mg BID. A levetiracetam level was drawn and is pending — results may indicate sub-therapeutic dosing or non-adherence. He sent a message through the patient portal describing the event (witnessed by his partner, duration ~90 seconds, post-ictal confusion for 15 minutes). Follow-up appointment needed within the week to assess medication adjustment.',
    pending_items: [
      {
        category: 'messages',
        description:
          'Patient message: described breakthrough seizure with witness account',
        age: '2 days ago',
      },
      {
        category: 'results',
        description:
          'Levetiracetam level drawn 2 days ago — result pending',
        age: '2 days',
      },
      {
        category: 'followups',
        description:
          'Urgent follow-up needed — breakthrough seizure on current AED',
        age: 'new',
      },
      {
        category: 'ehr',
        description: 'EHR medication reconciliation flag — verify adherence',
        age: '2 days',
      },
    ],
    recent_events: [
      {
        date: '2026-02-22',
        event: 'Patient message: breakthrough seizure reported',
        source: 'sevaro',
      },
      {
        date: '2026-02-22',
        event: 'Lab order: levetiracetam level, BMP',
        source: 'ehr',
      },
      {
        date: '2026-02-10',
        event: 'Office visit — routine epilepsy follow-up (seizure-free)',
        source: 'sevaro',
      },
      {
        date: '2026-01-28',
        event: 'Refill processed: levetiracetam 1500 mg BID',
        source: 'ehr',
      },
    ],
    quick_links: {
      chart: '/physician?patient=p-2',
      wearable: '/wearable?patient=p-2',
      followup: '/follow-up?patient=p-2',
    },
  },

  'p-3': {
    ai_summary:
      'Helen Park is a 72-year-old woman admitted 5 days ago for acute ischemic stroke (left MCA territory). She has shown good neurological recovery (NIHSS improved from 8 to 3). Continuous telemetry revealed new-onset atrial fibrillation yesterday. CHA2DS2-VASc score is 5 (age, female, hypertension, diabetes, stroke). An anticoagulation decision is needed — cardiology consult requested but not yet completed. Echocardiogram shows moderate LA enlargement. Carotid duplex was unremarkable. She will need a stroke prevention plan before discharge.',
    pending_items: [
      {
        category: 'results',
        description: 'Echocardiogram — moderate LA enlargement, EF 55%',
        age: '1 day',
      },
      {
        category: 'results',
        description: 'HbA1c result: 7.8% (suboptimal control)',
        age: '2 days',
      },
      {
        category: 'followups',
        description:
          'Cardiology consult requested for AFib/anticoagulation — pending',
        age: '1 day',
      },
      {
        category: 'triage',
        description:
          'Anticoagulation decision needed prior to discharge (CHA2DS2-VASc = 5)',
        age: 'active',
      },
      {
        category: 'ehr',
        description: 'Discharge planning: stroke prevention orders needed',
        age: 'active',
      },
      {
        category: 'ehr',
        description: 'Telemetry: new-onset AFib documented, needs cardiology sign-off',
        age: '1 day',
      },
    ],
    recent_events: [
      {
        date: '2026-02-24',
        event: 'Inpatient round — NIHSS 3, AFib on telemetry',
        source: 'sevaro',
      },
      {
        date: '2026-02-23',
        event: 'Telemetry alert: new-onset atrial fibrillation',
        source: 'ehr',
      },
      {
        date: '2026-02-23',
        event: 'Echocardiogram completed — moderate LA enlargement',
        source: 'ehr',
      },
      {
        date: '2026-02-22',
        event: 'Lab result: HbA1c 7.8%, LDL 142',
        source: 'ehr',
      },
      {
        date: '2026-02-19',
        event: 'Admission — acute ischemic stroke, NIHSS 8, tPA administered',
        source: 'sevaro',
      },
    ],
    quick_links: {
      chart: '/physician?patient=p-3',
      wearable: '/wearable?patient=p-3',
      followup: '/follow-up?patient=p-3',
    },
  },

  'p-4': {
    ai_summary:
      "Dorothy Chen is an 81-year-old woman with Alzheimer's Disease (moderate stage) whose daughter sent a portal message 2 days ago requesting a family care conference to discuss progression and caregiving concerns. The message is unread. Dorothy's last MoCA was administered 8 months ago (score: 16/30) and is now overdue for re-assessment. She is currently on donepezil 10 mg daily and memantine 10 mg BID. Her daughter has also reported increased nighttime wandering and agitation.",
    pending_items: [
      {
        category: 'messages',
        description:
          "Daughter's message requesting family care conference — unread",
        age: '2 days',
      },
      {
        category: 'scales',
        description: 'MoCA overdue (last score: 16/30, 8 months ago)',
        age: 'overdue',
      },
    ],
    recent_events: [
      {
        date: '2026-02-22',
        event: "Family message: daughter requesting care conference",
        source: 'sevaro',
      },
      {
        date: '2026-02-10',
        event: 'Office visit — routine follow-up, donepezil continued',
        source: 'sevaro',
      },
      {
        date: '2025-06-15',
        event: 'MoCA administered — score 16/30',
        source: 'sevaro',
      },
    ],
    quick_links: {
      chart: '/physician?patient=p-4',
      wearable: '/wearable?patient=p-4',
      followup: '/follow-up?patient=p-4',
    },
  },

  'p-5': {
    ai_summary:
      'Robert Kim is a 55-year-old man with relapsing-remitting Multiple Sclerosis who has shown EDSS worsening from 4.0 to 4.5 over 6 months, raising concern for disease progression despite Ocrevus therapy. His next Ocrevus infusion is due in 5 days. Wearable gait analysis shows a 15% decrease in walking speed over 3 months. MRI Brain from last month showed 1 new T2 lesion. An EDSS re-assessment and possible treatment discussion (escalation vs. switch) are warranted at the next visit.',
    pending_items: [
      {
        category: 'refills',
        description: 'Ocrevus infusion due Feb 29 — pre-authorization confirmed',
        age: 'due in 5 days',
      },
      {
        category: 'results',
        description: 'MRI Brain (Jan): 1 new T2 lesion — needs discussion',
        age: '4 weeks',
      },
      {
        category: 'wearables',
        description: 'Gait speed declined 15% over 3 months',
        age: 'ongoing',
      },
      {
        category: 'scales',
        description: 'EDSS re-assessment due (last: 4.5, up from 4.0)',
        age: 'due',
      },
    ],
    recent_events: [
      {
        date: '2026-02-19',
        event: 'Office visit — EDSS 4.5, discussed disease trajectory',
        source: 'sevaro',
      },
      {
        date: '2026-02-15',
        event: 'Wearable report: gait speed trend declining',
        source: 'wearable',
      },
      {
        date: '2026-01-25',
        event: 'MRI Brain — 1 new T2 lesion, no gadolinium enhancement',
        source: 'ehr',
      },
      {
        date: '2025-11-20',
        event: 'Ocrevus infusion completed — no adverse reactions',
        source: 'ehr',
      },
    ],
    quick_links: {
      chart: '/physician?patient=p-5',
      wearable: '/wearable?patient=p-5',
      followup: '/follow-up?patient=p-5',
    },
  },

  'p-6': {
    ai_summary:
      'Linda Martinez is a 62-year-old woman with chronic migraine (15+ headache days/month) who has 3 pending refill requests: sumatriptan 100 mg, topiramate 100 mg, and ondansetron 4 mg. Her headache diary (submitted through the patient portal) shows a 40% increase in headache frequency over the past month despite current prophylaxis. She sent 2 portal messages in the past week — one about the refills and one about worsening headache severity. A MIDAS reassessment and possible prophylaxis adjustment (CGRP inhibitor trial) should be considered.',
    pending_items: [
      {
        category: 'messages',
        description: 'Patient message: concern about increasing headache severity',
        age: '1 day',
      },
      {
        category: 'messages',
        description: 'Patient message: requesting refill status update',
        age: '3 days',
      },
      {
        category: 'refills',
        description: 'Sumatriptan 100 mg — refill request pending',
        age: '3 days',
      },
      {
        category: 'refills',
        description: 'Topiramate 100 mg — refill request pending',
        age: '3 days',
      },
      {
        category: 'refills',
        description: 'Ondansetron 4 mg — refill request pending',
        age: '3 days',
      },
    ],
    recent_events: [
      {
        date: '2026-02-23',
        event: 'Patient message: headache worsening concern',
        source: 'sevaro',
      },
      {
        date: '2026-02-21',
        event: 'Refill requests submitted: sumatriptan, topiramate, ondansetron',
        source: 'sevaro',
      },
      {
        date: '2026-02-21',
        event: 'Patient message: refill status inquiry',
        source: 'sevaro',
      },
      {
        date: '2026-02-05',
        event: 'Office visit — migraine follow-up, MIDAS score 28 (severe)',
        source: 'sevaro',
      },
    ],
    quick_links: {
      chart: '/physician?patient=p-6',
      wearable: '/wearable?patient=p-6',
      followup: '/follow-up?patient=p-6',
    },
  },
}

// ─── Template-based summary for patients without detailed data ───────────────

interface PatientStub {
  name: string
  age: number
  sex: string
  primary_diagnosis: string
  urgency: string
  ai_micro_summary: string
}

const PATIENT_STUBS: Record<string, PatientStub> = {
  'p-7': {
    name: 'Thomas Wright',
    age: 48,
    sex: 'M',
    primary_diagnosis: 'Peripheral Neuropathy',
    urgency: 'watch',
    ai_micro_summary:
      'EMG results pending 10 days. Gabapentin refill due — request not yet received.',
  },
  'p-8': {
    name: 'Patricia Nguyen',
    age: 71,
    sex: 'F',
    primary_diagnosis: 'Essential Tremor',
    urgency: 'watch',
    ai_micro_summary:
      'Propranolol dose optimization needed. Follow-up overdue by 3 weeks.',
  },
  'p-9': {
    name: 'David Hernandez',
    age: 43,
    sex: 'M',
    primary_diagnosis: 'Sleep Disorder',
    urgency: 'watch',
    ai_micro_summary:
      'Sleep study referral sent 6 weeks ago — no report received. Follow-up pending.',
  },
  'p-10': {
    name: 'Susan Williams',
    age: 58,
    sex: 'F',
    primary_diagnosis: 'Tension Headache',
    urgency: 'stable',
    ai_micro_summary:
      'Routine follow-up. All scales complete, stable on current regimen.',
  },
  'p-11': {
    name: 'Michael Johnson',
    age: 67,
    sex: 'M',
    primary_diagnosis: "Parkinson's Disease",
    urgency: 'stable',
    ai_micro_summary:
      'Stable on carbidopa-levodopa. Next visit scheduled in 2 months.',
  },
  'p-12': {
    name: 'Angela Brown',
    age: 39,
    sex: 'F',
    primary_diagnosis: 'Epilepsy',
    urgency: 'stable',
    ai_micro_summary:
      'Seizure-free 18 months on lamotrigine. Annual EEG scheduled for March.',
  },
}

function generateTemplateSummary(id: string): PatientSummaryResponse | null {
  const stub = PATIENT_STUBS[id]
  if (!stub) return null

  const sexWord = stub.sex === 'F' ? 'woman' : 'man'

  return {
    ai_summary: `${stub.name} is a ${stub.age}-year-old ${sexWord} with ${stub.primary_diagnosis}. ${stub.ai_micro_summary} Current status: ${stub.urgency}. No critical action items at this time.`,
    pending_items: [],
    recent_events: [
      {
        date: '2026-02-20',
        event: `Last documented encounter for ${stub.primary_diagnosis}`,
        source: 'sevaro',
      },
    ],
    quick_links: {
      chart: `/physician?patient=${id}`,
      wearable: `/wearable?patient=${id}`,
      followup: `/follow-up?patient=${id}`,
    },
  }
}

// ─── GET /api/command-center/patients/[id]/summary ──────────────────────────
// Returns a detailed AI summary, pending items, recent events, and quick links
// for a single patient in the priority queue.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check detailed summaries first, then fall back to template
    const summary =
      DETAILED_SUMMARIES[id] ?? generateTemplateSummary(id)

    if (!summary) {
      return NextResponse.json(
        { error: `Patient ${id} not found` },
        { status: 404 }
      )
    }

    return NextResponse.json(summary)
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to fetch patient summary'
    console.error('Command Center Patient Summary Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
