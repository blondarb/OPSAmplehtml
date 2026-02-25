import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type {
  ActionItem,
  BatchGroup,
  ActionsResponse,
  ViewMode,
  TimeRange,
} from '@/lib/command-center/types'

// ── In-memory demo data ──
// Exported so the approve / batch-approve routes can reference the same array.

export const DEMO_ACTIONS: ActionItem[] = [
  // ── Individual actions (no batch) ──
  {
    id: 'act-1',
    action_type: 'order',
    confidence: 'high',
    patient_id: 'p-1',
    patient_name: 'Maria Santos',
    title: 'PT referral',
    description:
      '2nd fall in 9 days, progressive tremor worsening. Physical therapy evaluation needed.',
    drafted_content:
      'Referral for Physical Therapy evaluation and treatment. Diagnosis: Parkinson\'s Disease (G20). Patient has experienced 2 falls in 9 days with progressive tremor worsening per wearable data. Please evaluate for gait training, balance exercises, and fall prevention strategies.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T06:30:00Z',
  },
  {
    id: 'act-2',
    action_type: 'call',
    confidence: 'medium',
    patient_id: 'p-2',
    patient_name: 'James Okonkwo',
    title: 'Seizure medication adjustment',
    description:
      'Breakthrough seizure reported yesterday. Levetiracetam trough was sub-therapeutic at last draw. Phone call to discuss dose increase.',
    drafted_content:
      'Call patient to discuss increasing Levetiracetam from 500 mg BID to 750 mg BID given breakthrough seizure on 2/23 and sub-therapeutic trough level (8.2 mcg/mL). Review seizure diary and confirm compliance.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T06:15:00Z',
  },
  {
    id: 'act-3',
    action_type: 'pcp_summary',
    confidence: 'low',
    patient_id: 'p-3',
    patient_name: 'Dorothy Chen',
    title: 'PCP summary letter',
    description:
      'New diagnosis of myasthenia gravis. PCP has not received summary from initial neurology evaluation 3 weeks ago.',
    drafted_content:
      'Dear Dr. Patel,\n\nThank you for referring Dorothy Chen for neurologic evaluation. She was seen on 2/4/2026 for progressive bilateral ptosis and proximal weakness. Workup confirmed acetylcholine receptor antibody-positive generalized myasthenia gravis (MGFA Class II). CT chest was negative for thymoma.\n\nWe have initiated Pyridostigmine 60 mg TID with plans for steroid-sparing immunotherapy. She will follow up in our clinic in 4 weeks.\n\nPlease do not hesitate to contact us with any questions.\n\nSincerely,\nDr. Arbogast, Neurology',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T05:45:00Z',
  },
  {
    id: 'act-4',
    action_type: 'care_gap',
    confidence: 'medium',
    patient_id: 'p-4',
    patient_name: 'Robert Kim',
    title: 'Overdue MRI Brain',
    description:
      'MS patient — annual MRI Brain surveillance overdue by 2 months. Last scan 2/2025.',
    drafted_content:
      'Order: MRI Brain with and without contrast.\nIndication: Multiple sclerosis surveillance. Last imaging 02/2025, now 12 months overdue.\nPriority: Routine.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T06:00:00Z',
  },
  // ── Refill batch (all high confidence) ──
  {
    id: 'act-5',
    action_type: 'refill',
    confidence: 'high',
    patient_id: 'p-5',
    patient_name: 'Helen Park',
    title: 'Topiramate 50 mg refill',
    description:
      'Migraine prophylaxis — stable dose for 8 months. Pharmacy fax received.',
    drafted_content:
      'Approve refill: Topiramate 50 mg, 1 tablet BID, #60, 3 refills.',
    batch_id: 'batch-refills',
    status: 'pending',
    created_at: '2026-02-25T05:00:00Z',
  },
  {
    id: 'act-6',
    action_type: 'refill',
    confidence: 'high',
    patient_id: 'p-6',
    patient_name: 'Linda Martinez',
    title: 'Levetiracetam 500 mg refill',
    description:
      'Epilepsy maintenance — seizure-free 14 months. Pharmacy fax received.',
    drafted_content:
      'Approve refill: Levetiracetam 500 mg, 1 tablet BID, #60, 3 refills.',
    batch_id: 'batch-refills',
    status: 'pending',
    created_at: '2026-02-25T05:05:00Z',
  },
  {
    id: 'act-7',
    action_type: 'refill',
    confidence: 'high',
    patient_id: 'p-7',
    patient_name: 'Thomas Wright',
    title: 'Ropinirole 2 mg refill',
    description:
      'Restless legs syndrome — stable on current dose 6 months. Pharmacy request.',
    drafted_content:
      'Approve refill: Ropinirole 2 mg, 1 tablet QHS, #30, 3 refills.',
    batch_id: 'batch-refills',
    status: 'pending',
    created_at: '2026-02-25T05:10:00Z',
  },
  // ── Scale reminder batch (all high confidence) ──
  {
    id: 'act-8',
    action_type: 'scale_reminder',
    confidence: 'high',
    patient_id: 'p-8',
    patient_name: 'Susan Nguyen',
    title: 'MIDAS questionnaire due',
    description:
      'Chronic migraine follow-up tomorrow. MIDAS not completed — send patient portal reminder.',
    drafted_content:
      'Hi Susan, you have an appointment tomorrow with Dr. Arbogast. Please complete your MIDAS headache questionnaire in the patient portal before your visit. This helps us track your progress.',
    batch_id: 'batch-scales',
    status: 'pending',
    created_at: '2026-02-25T04:30:00Z',
  },
  {
    id: 'act-9',
    action_type: 'scale_reminder',
    confidence: 'high',
    patient_id: 'p-9',
    patient_name: 'George Petrov',
    title: 'PHQ-9 questionnaire due',
    description:
      'Epilepsy + depression follow-up this week. PHQ-9 not completed since last visit.',
    drafted_content:
      'Hi George, as part of your upcoming neurology follow-up, please complete the PHQ-9 mood questionnaire in the patient portal. This helps us monitor your treatment.',
    batch_id: 'batch-scales',
    status: 'pending',
    created_at: '2026-02-25T04:35:00Z',
  },
  // ── Patient messages batch (mixed confidence — NOT batch-approvable) ──
  {
    id: 'act-10',
    action_type: 'message',
    confidence: 'high',
    patient_id: 'p-10',
    patient_name: 'Patricia Adams',
    title: 'Reply to medication side effect question',
    description:
      'Patient asked about dizziness with new Gabapentin dose. Straightforward dose-timing guidance.',
    drafted_content:
      'Hi Patricia, dizziness is a common side effect when starting Gabapentin and usually improves after 1-2 weeks. Try taking your dose at bedtime to reduce daytime dizziness. If it persists or worsens, please call our office. — Dr. Arbogast\'s team',
    batch_id: 'batch-messages',
    status: 'pending',
    created_at: '2026-02-25T06:20:00Z',
  },
  {
    id: 'act-11',
    action_type: 'message',
    confidence: 'high',
    patient_id: 'p-11',
    patient_name: 'William Foster',
    title: 'Reply to appointment scheduling request',
    description:
      'Patient requesting earlier follow-up. Stable Parkinson\'s — can confirm next available.',
    drafted_content:
      'Hi William, we can move your follow-up appointment earlier. Our next available slot is March 5 at 2:00 PM. Would you like us to reschedule? — Dr. Arbogast\'s team',
    batch_id: 'batch-messages',
    status: 'pending',
    created_at: '2026-02-25T06:10:00Z',
  },
  {
    id: 'act-12',
    action_type: 'message',
    confidence: 'medium',
    patient_id: 'p-12',
    patient_name: 'Nancy Yamamoto',
    title: 'Reply to new symptom report',
    description:
      'Patient reports new numbness in left hand. Needs clinical judgment — AI draft is conservative.',
    drafted_content:
      'Hi Nancy, thank you for letting us know about the numbness in your left hand. Given your history, we would like to evaluate this further. Please call our office at (555) 123-4567 to schedule an appointment this week. If symptoms worsen or you develop weakness, please go to the nearest emergency room. — Dr. Arbogast\'s team',
    batch_id: 'batch-messages',
    status: 'pending',
    created_at: '2026-02-25T06:25:00Z',
  },
  // ── More individual actions ──
  {
    id: 'act-13',
    action_type: 'appointment',
    confidence: 'high',
    patient_id: 'p-13',
    patient_name: 'Carol Washington',
    title: 'Schedule EMG follow-up',
    description:
      'EMG/NCS completed last week showing carpal tunnel. Follow-up in 2 weeks to discuss results.',
    drafted_content:
      'Schedule 30-minute follow-up appointment for Carol Washington, 2 weeks from today. Reason: EMG/NCS results review — carpal tunnel syndrome.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T05:30:00Z',
  },
  {
    id: 'act-14',
    action_type: 'pa_followup',
    confidence: 'high',
    patient_id: 'p-14',
    patient_name: 'Edward Brooks',
    title: 'Prior auth follow-up: Aimovig',
    description:
      'PA submitted 5 business days ago for Aimovig (erenumab). No response from insurance yet — follow-up needed.',
    drafted_content:
      'Follow up with Aetna on prior authorization for Aimovig 70 mg monthly injection for Edward Brooks (DOB: 04/15/1978). PA reference #AET-2026-88431. Submitted 2/18/2026. Diagnosis: Chronic migraine (G43.709). Patient has failed Topiramate and Propranolol.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T05:15:00Z',
  },
  {
    id: 'act-15',
    action_type: 'care_gap',
    confidence: 'medium',
    patient_id: 'p-15',
    patient_name: 'Margaret Liu',
    title: 'Vitamin D level overdue',
    description:
      'On high-dose Vitamin D for deficiency associated with MS. Last level drawn 8 months ago.',
    drafted_content:
      'Order: 25-hydroxy Vitamin D level.\nIndication: Monitoring Vitamin D supplementation in multiple sclerosis. Last drawn 06/2025.\nPriority: Routine.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T04:50:00Z',
  },
  {
    id: 'act-16',
    action_type: 'order',
    confidence: 'high',
    patient_id: 'p-16',
    patient_name: 'Frank Alvarez',
    title: 'EEG order for new-onset seizure',
    description:
      'First seizure 48 hours ago per ER records. Needs routine EEG before follow-up visit next week.',
    drafted_content:
      'Order: Routine EEG (60 min with hyperventilation and photic stimulation).\nIndication: New-onset seizure, unprovoked, 02/23/2026. Evaluate for epileptiform activity.\nPriority: Urgent — complete before follow-up on 03/04/2026.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T06:45:00Z',
  },
  {
    id: 'act-17',
    action_type: 'call',
    confidence: 'high',
    patient_id: 'p-17',
    patient_name: 'Barbara Scott',
    title: 'Wearable alert callback',
    description:
      'Wearable detected 3 possible tremor episodes overnight — patient unaware. Proactive outreach.',
    drafted_content:
      'Call Barbara Scott to discuss wearable tremor data from overnight 2/24-2/25. Three episodes detected (2:15 AM, 3:40 AM, 5:10 AM). Assess symptom awareness, sleep quality, and whether medication timing adjustment is needed.',
    batch_id: null,
    status: 'pending',
    created_at: '2026-02-25T07:00:00Z',
  },
]

// ── Batch groups computed from actions ──

function buildBatchGroups(actions: ActionItem[]): BatchGroup[] {
  const batchMap = new Map<string, ActionItem[]>()

  for (const a of actions) {
    if (a.batch_id) {
      const existing = batchMap.get(a.batch_id) || []
      existing.push(a)
      batchMap.set(a.batch_id, existing)
    }
  }

  const groups: BatchGroup[] = []

  for (const [batchId, items] of batchMap) {
    const allHigh = items.every((i) => i.confidence === 'high')
    const pendingItems = items.filter((i) => i.status === 'pending')

    // Only include batches that still have pending items
    if (pendingItems.length === 0) continue

    const actionType = items[0].action_type
    const labelMap: Record<string, string> = {
      refill: 'Refill Reminders',
      scale_reminder: 'Scale Reminders',
      message: 'Patient Messages',
    }

    groups.push({
      batch_id: batchId,
      action_type: actionType,
      count: pendingItems.length,
      all_high_confidence: allHigh,
      label: `${pendingItems.length} ${labelMap[actionType] || actionType}`,
      action_ids: pendingItems.map((i) => i.id),
    })
  }

  return groups
}

// ── GET /api/command-center/actions ──

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Read optional query params (reserved for future filtering)
    const { searchParams } = new URL(request.url)
    const _viewMode = (searchParams.get('view_mode') || 'my_patients') as ViewMode
    const _timeRange = (searchParams.get('time_range') || 'today') as TimeRange

    // Return all demo actions sorted newest-first
    const sortedActions = [...DEMO_ACTIONS].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const batchGroups = buildBatchGroups(DEMO_ACTIONS)

    const response: ActionsResponse = {
      actions: sortedActions,
      batch_groups: batchGroups,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Command Center Actions Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load actions' },
      { status: 500 }
    )
  }
}
