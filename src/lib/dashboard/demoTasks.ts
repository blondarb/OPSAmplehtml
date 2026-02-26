// ──────────────────────────────────────────────────────────────────────────────
// Demo MA Tasks
// 10 tasks derived from patient stories for the MA Dashboard
// ──────────────────────────────────────────────────────────────────────────────

import type { MATask, TaskPriority } from './types'

export const DEMO_MA_TASKS: MATask[] = [
  {
    id: 'task-1',
    type: 'call_patient',
    patient_id: 'pt-delgado',
    provider_id: 'prov-chen',
    priority: 'urgent',
    status: 'pending',
    description:
      'Carlos Delgado no-show for urgent GBS evaluation — call to reschedule ASAP, assess safety',
    due_by: '2026-02-26T10:00:00',
    created_at: '2026-02-26T09:15:00',
  },
  {
    id: 'task-2',
    type: 'tech_help',
    patient_id: 'pt-santos',
    provider_id: 'prov-chen',
    priority: 'urgent',
    status: 'in_progress',
    description:
      'Maria Santos video not connecting for home visit — troubleshoot or switch to phone',
    due_by: '2026-02-26T09:30:00',
    created_at: '2026-02-26T09:25:00',
  },
  {
    id: 'task-3',
    type: 'send_historian_link',
    patient_id: 'pt-voss',
    provider_id: 'prov-patel',
    priority: 'time_sensitive',
    status: 'pending',
    description:
      'Eleanor Voss historian link sent but not started — send reminder, appointment at 9:30',
    due_by: '2026-02-26T09:30:00',
    created_at: '2026-02-26T09:00:00',
  },
  {
    id: 'task-4',
    type: 'send_intake_form',
    patient_id: 'pt-price',
    provider_id: 'prov-chen',
    priority: 'time_sensitive',
    status: 'pending',
    description:
      'Angela Price has no pre-visit data — send intake form and historian link before 10:30 appointment',
    due_by: '2026-02-26T10:00:00',
    created_at: '2026-02-26T08:30:00',
  },
  {
    id: 'task-5',
    type: 'post_visit_task',
    patient_id: 'pt-brown',
    provider_id: 'prov-patel',
    priority: 'routine',
    status: 'pending',
    description:
      'Keisha Brown post-visit: fax Keppra adjustment note to PCP, schedule 2-week follow-up call',
    due_by: null,
    created_at: '2026-02-26T09:15:00',
  },
  {
    id: 'task-6',
    type: 'prep_records',
    patient_id: 'pt-jennings',
    provider_id: 'prov-chen',
    priority: 'routine',
    status: 'completed',
    description:
      'Harold Jennings triage records imported to chart prep — ready for 10:00 appointment',
    due_by: '2026-02-26T09:45:00',
    created_at: '2026-02-26T08:00:00',
  },
  {
    id: 'task-7',
    type: 'check_video',
    patient_id: 'pt-alvarez',
    provider_id: 'prov-rivera',
    priority: 'time_sensitive',
    status: 'pending',
    description:
      'Robert Alvarez home visit at 10:00 — verify video link works, patient has depression safety flag',
    due_by: '2026-02-26T09:45:00',
    created_at: '2026-02-26T09:00:00',
  },
  {
    id: 'task-8',
    type: 'coordinate_local_ma',
    patient_id: 'pt-dongyue',
    provider_id: 'prov-rivera',
    priority: 'routine',
    status: 'pending',
    description:
      'Chen Dongyue vitals done, waiting at Riverview — confirm room ready for Dr. Rivera video after current visit',
    due_by: null,
    created_at: '2026-02-26T09:20:00',
  },
  {
    id: 'task-9',
    type: 'send_historian_link',
    patient_id: 'pt-moore',
    provider_id: 'prov-patel',
    priority: 'time_sensitive',
    status: 'pending',
    description:
      'Patricia Moore has no pre-visit data — send historian link before 10:30 appointment',
    due_by: '2026-02-26T10:00:00',
    created_at: '2026-02-26T08:30:00',
  },
  {
    id: 'task-10',
    type: 'send_historian_link',
    patient_id: 'pt-park',
    provider_id: 'prov-rivera',
    priority: 'time_sensitive',
    status: 'pending',
    description:
      'Lisa Park new MS referral with no pre-visit data — send historian link before 11:00 appointment',
    due_by: '2026-02-26T10:30:00',
    created_at: '2026-02-26T08:30:00',
  },
]

// --- Helper functions ----------------------------------------------------------

export function getTasksByProvider(providerId: string): MATask[] {
  return DEMO_MA_TASKS.filter((t) => t.provider_id === providerId)
}

export function getTasksByPriority(): MATask[] {
  const order: Record<string, number> = { urgent: 0, time_sensitive: 1, routine: 2 }
  return [...DEMO_MA_TASKS].sort(
    (a, b) => (order[a.priority] ?? 99) - (order[b.priority] ?? 99)
  )
}

export function getPendingTasks(): MATask[] {
  return DEMO_MA_TASKS.filter((t) => t.status !== 'completed')
}
