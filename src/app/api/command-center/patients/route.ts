import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/cognito/server'
import type {
  PatientQueueItem,
  PatientsResponse,
  PatientUrgency,
  CategoryFilter,
} from '@/lib/command-center/types'

// ─── Demo patient queue ─────────────────────────────────────────────────────
// Hardcoded priority patient list used as the prototype data source.
// Patients are pre-sorted by urgency: urgent > attention > watch > stable.

const DEMO_PATIENTS: PatientQueueItem[] = [
  // ── Urgent (red) ──────────────────────────────────────────────────────────
  {
    id: 'p-1',
    name: 'Maria Santos',
    age: 68,
    sex: 'F',
    primary_diagnosis: "Parkinson's Disease",
    urgency: 'urgent',
    pending_items: {
      messages: 0,
      refills: 1,
      results: 1,
      wearables: 2,
      followups: 0,
      triage: 0,
      scales: 1,
      ehr: 0,
    },
    ai_micro_summary:
      'Progressive tremor worsening + 2 falls. PT referral needed.',
    last_contact: { date: '2026-02-23', method: 'wearable_alert' },
    sources: ['sevaro', 'wearable'],
  },
  {
    id: 'p-2',
    name: 'James Okonkwo',
    age: 34,
    sex: 'M',
    primary_diagnosis: 'Epilepsy',
    urgency: 'urgent',
    pending_items: {
      messages: 1,
      refills: 0,
      results: 1,
      wearables: 0,
      followups: 1,
      triage: 0,
      scales: 0,
      ehr: 1,
    },
    ai_micro_summary:
      'Breakthrough seizure reported 2 days ago. Levetiracetam level pending — may need dose adjustment.',
    last_contact: { date: '2026-02-22', method: 'patient_message' },
    sources: ['sevaro', 'ehr'],
  },
  {
    id: 'p-3',
    name: 'Helen Park',
    age: 72,
    sex: 'F',
    primary_diagnosis: 'Acute Ischemic Stroke',
    urgency: 'urgent',
    pending_items: {
      messages: 0,
      refills: 0,
      results: 2,
      wearables: 0,
      followups: 1,
      triage: 1,
      scales: 0,
      ehr: 2,
    },
    ai_micro_summary:
      'New onset AFib on telemetry. Needs anticoagulation decision — CHA2DS2-VASc = 5.',
    last_contact: { date: '2026-02-24', method: 'inpatient_round' },
    sources: ['sevaro', 'ehr'],
  },

  // ── Attention (orange) ────────────────────────────────────────────────────
  {
    id: 'p-4',
    name: 'Dorothy Chen',
    age: 81,
    sex: 'F',
    primary_diagnosis: "Alzheimer's Disease",
    urgency: 'attention',
    pending_items: {
      messages: 1,
      refills: 0,
      results: 0,
      wearables: 0,
      followups: 0,
      triage: 0,
      scales: 1,
      ehr: 0,
    },
    ai_micro_summary:
      'Family message unread 2 days — requesting care conference. MoCA overdue (last 8 months ago).',
    last_contact: { date: '2026-02-22', method: 'family_message' },
    sources: ['sevaro'],
  },
  {
    id: 'p-5',
    name: 'Robert Kim',
    age: 55,
    sex: 'M',
    primary_diagnosis: 'Multiple Sclerosis',
    urgency: 'attention',
    pending_items: {
      messages: 0,
      refills: 1,
      results: 1,
      wearables: 1,
      followups: 0,
      triage: 0,
      scales: 1,
      ehr: 0,
    },
    ai_micro_summary:
      'EDSS worsening 4.0 to 4.5 over 6 months. Ocrevus infusion due in 5 days.',
    last_contact: { date: '2026-02-19', method: 'office_visit' },
    sources: ['sevaro', 'wearable'],
  },
  {
    id: 'p-6',
    name: 'Linda Martinez',
    age: 62,
    sex: 'F',
    primary_diagnosis: 'Migraine',
    urgency: 'attention',
    pending_items: {
      messages: 2,
      refills: 3,
      results: 0,
      wearables: 0,
      followups: 0,
      triage: 0,
      scales: 0,
      ehr: 0,
    },
    ai_micro_summary:
      '3 refill requests pending (sumatriptan, topiramate, ondansetron). Headache diary shows 40% increase in frequency.',
    last_contact: { date: '2026-02-21', method: 'patient_message' },
    sources: ['sevaro'],
  },

  // ── Watch (yellow) ────────────────────────────────────────────────────────
  {
    id: 'p-7',
    name: 'Thomas Wright',
    age: 48,
    sex: 'M',
    primary_diagnosis: 'Peripheral Neuropathy',
    urgency: 'watch',
    pending_items: {
      messages: 0,
      refills: 1,
      results: 1,
      wearables: 0,
      followups: 0,
      triage: 0,
      scales: 0,
      ehr: 1,
    },
    ai_micro_summary:
      'EMG results pending 10 days. Gabapentin refill due — request not yet received.',
    last_contact: { date: '2026-02-14', method: 'office_visit' },
    sources: ['sevaro', 'ehr'],
  },
  {
    id: 'p-8',
    name: 'Patricia Nguyen',
    age: 71,
    sex: 'F',
    primary_diagnosis: 'Essential Tremor',
    urgency: 'watch',
    pending_items: {
      messages: 0,
      refills: 0,
      results: 0,
      wearables: 1,
      followups: 1,
      triage: 0,
      scales: 0,
      ehr: 0,
    },
    ai_micro_summary:
      'Propranolol dose optimization needed. Follow-up overdue by 3 weeks.',
    last_contact: { date: '2026-02-03', method: 'office_visit' },
    sources: ['sevaro', 'wearable'],
  },
  {
    id: 'p-9',
    name: 'David Hernandez',
    age: 43,
    sex: 'M',
    primary_diagnosis: 'Sleep Disorder',
    urgency: 'watch',
    pending_items: {
      messages: 0,
      refills: 0,
      results: 1,
      wearables: 0,
      followups: 1,
      triage: 0,
      scales: 0,
      ehr: 0,
    },
    ai_micro_summary:
      'Sleep study referral sent 6 weeks ago — no report received. Follow-up pending.',
    last_contact: { date: '2026-01-14', method: 'referral' },
    sources: ['sevaro'],
  },

  // ── Stable (green) ────────────────────────────────────────────────────────
  {
    id: 'p-10',
    name: 'Susan Williams',
    age: 58,
    sex: 'F',
    primary_diagnosis: 'Tension Headache',
    urgency: 'stable',
    pending_items: {
      messages: 0,
      refills: 0,
      results: 0,
      wearables: 0,
      followups: 0,
      triage: 0,
      scales: 0,
      ehr: 0,
    },
    ai_micro_summary:
      'Routine follow-up. All scales complete, stable on current regimen.',
    last_contact: { date: '2026-02-20', method: 'office_visit' },
    sources: ['sevaro'],
  },
  {
    id: 'p-11',
    name: 'Michael Johnson',
    age: 67,
    sex: 'M',
    primary_diagnosis: "Parkinson's Disease",
    urgency: 'stable',
    pending_items: {
      messages: 0,
      refills: 0,
      results: 0,
      wearables: 0,
      followups: 0,
      triage: 0,
      scales: 0,
      ehr: 0,
    },
    ai_micro_summary:
      'Stable on carbidopa-levodopa. Next visit scheduled in 2 months.',
    last_contact: { date: '2026-02-10', method: 'office_visit' },
    sources: ['sevaro'],
  },
  {
    id: 'p-12',
    name: 'Angela Brown',
    age: 39,
    sex: 'F',
    primary_diagnosis: 'Epilepsy',
    urgency: 'stable',
    pending_items: {
      messages: 0,
      refills: 0,
      results: 0,
      wearables: 0,
      followups: 0,
      triage: 0,
      scales: 0,
      ehr: 0,
    },
    ai_micro_summary:
      'Seizure-free 18 months on lamotrigine. Annual EEG scheduled for March.',
    last_contact: { date: '2026-02-15', method: 'office_visit' },
    sources: ['sevaro'],
  },
]

// ─── Urgency sort order ──────────────────────────────────────────────────────

const URGENCY_ORDER: Record<PatientUrgency, number> = {
  urgent: 0,
  attention: 1,
  watch: 2,
  stable: 3,
}

// ─── GET /api/command-center/patients ────────────────────────────────────────
// Returns the priority patient queue, optionally filtered and sorted.
//
// Query params:
//   view_mode — 'my_patients' (default) | 'all_patients'
//   category  — filter by pending item type (e.g. 'messages', 'refills')
//   urgency   — filter by urgency level ('urgent', 'attention', 'watch', 'stable')
//   search    — case-insensitive patient name search

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const _viewMode = searchParams.get('view_mode') || 'my_patients'
    const category = searchParams.get('category') as CategoryFilter | null
    const urgency = searchParams.get('urgency') as PatientUrgency | null
    const search = searchParams.get('search')

    // Start from full demo list
    let patients = [...DEMO_PATIENTS]

    // ── Filter by category (only patients with pending items in that category)
    if (category && category !== 'all') {
      patients = patients.filter((p) => {
        const key = category as keyof typeof p.pending_items
        return p.pending_items[key] > 0
      })
    }

    // ── Filter by urgency level
    if (urgency) {
      patients = patients.filter((p) => p.urgency === urgency)
    }

    // ── Filter by patient name search (case-insensitive)
    if (search && search.trim().length > 0) {
      const q = search.toLowerCase().trim()
      patients = patients.filter((p) => p.name.toLowerCase().includes(q))
    }

    // ── Sort: urgency first, then by total pending item count descending
    patients.sort((a, b) => {
      const urgencyDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
      if (urgencyDiff !== 0) return urgencyDiff

      const totalA = Object.values(a.pending_items).reduce((s, v) => s + v, 0)
      const totalB = Object.values(b.pending_items).reduce((s, v) => s + v, 0)
      return totalB - totalA
    })

    const response: PatientsResponse = { patients }

    return NextResponse.json(response)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch patients'
    console.error('Command Center Patients Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
