// ──────────────────────────────────────────────────────────────────────────────
// Demo Practice Manager Metrics
// Static demo data for the Practice Manager Dashboard
// Design doc: docs/plans/2026-02-26-role-based-dashboards-plan.md
// ──────────────────────────────────────────────────────────────────────────────

import type {
  PracticeMetrics,
  ProviderPerformance,
  QualityMetrics,
  ActivityEvent,
  OperationalAlert,
} from './types'

// --- Practice-wide KPI tiles ---------------------------------------------------

export const DEMO_PRACTICE_METRICS: PracticeMetrics = {
  patients_today: { total: 42, seen: 28, remaining: 14 },
  utilization: { value: 87, trend: 4, trend_direction: 'up' },
  avg_wait_time: { minutes: 8, trend: -2, trend_direction: 'down' },
  no_shows: { count: 3, rate: 7 },
  ai_prep_rate: { value: 71, trend: 12, trend_direction: 'up' },
}

// --- Provider performance cards ------------------------------------------------

export const DEMO_PROVIDER_PERFORMANCE: ProviderPerformance[] = [
  {
    provider_id: 'prov-chen',
    name: 'Dr. Anita Chen',
    credentials: 'MD',
    utilization_pct: 92,
    seen: 2,
    total: 7,
    running_behind_minutes: 0,
    status_note: 'On schedule',
  },
  {
    provider_id: 'prov-patel',
    name: 'Dr. Raj Patel',
    credentials: 'DO',
    utilization_pct: 88,
    seen: 2,
    total: 7,
    running_behind_minutes: 0,
    status_note: 'On schedule',
  },
  {
    provider_id: 'prov-rivera',
    name: 'Dr. Sofia Rivera',
    credentials: 'MD',
    utilization_pct: 81,
    seen: 2,
    total: 6,
    running_behind_minutes: 8,
    status_note: 'Running +8 min behind',
  },
]

// --- Quality / compliance metrics ----------------------------------------------

export const DEMO_QUALITY_METRICS: QualityMetrics = {
  note_completion: {
    label: 'Note Completion',
    value: 85,
    target: 95,
    unit: '%',
    trend: 'up',
  },
  note_ehr_paste: {
    label: 'Note → EHR Paste Rate',
    value: 71,
    target: 90,
    unit: '%',
    trend: 'up',
  },
  followup_completion: {
    label: 'Follow-Up Completion',
    value: 90,
    target: 85,
    unit: '%',
    trend: 'flat',
  },
  triage_turnaround: {
    label: 'Triage Turnaround',
    value: 42,
    target: 60,
    unit: 'min',
    trend: 'down',
  },
}

// --- Chronological activity feed (8:00 AM – 9:40 AM) --------------------------

export const DEMO_ACTIVITY_FEED: ActivityEvent[] = [
  {
    id: 'evt-1',
    time: '2026-02-26T08:00:00',
    event_type: 'check_in',
    description: 'Linda Martinez checked in at Riverview',
    patient_name: 'Linda Martinez',
    provider_name: 'Dr. Chen',
    site_name: 'Riverview',
  },
  {
    id: 'evt-2',
    time: '2026-02-26T08:02:00',
    event_type: 'check_in',
    description: 'Dorothy Chen checked in at Riverview',
    patient_name: 'Dorothy Chen',
    provider_name: 'Dr. Patel',
    site_name: 'Riverview',
  },
  {
    id: 'evt-3',
    time: '2026-02-26T08:03:00',
    event_type: 'check_in',
    description: 'Sandra Williams checked in at Lakewood',
    patient_name: 'Sandra Williams',
    provider_name: 'Dr. Rivera',
    site_name: 'Lakewood',
  },
  {
    id: 'evt-4',
    time: '2026-02-26T08:05:00',
    event_type: 'visit_start',
    description: 'Visit started with Linda Martinez',
    patient_name: 'Linda Martinez',
    provider_name: 'Dr. Chen',
    site_name: 'Riverview',
  },
  {
    id: 'evt-5',
    time: '2026-02-26T08:07:00',
    event_type: 'visit_start',
    description: 'Visit started with Dorothy Chen',
    patient_name: 'Dorothy Chen',
    provider_name: 'Dr. Patel',
    site_name: 'Riverview',
  },
  {
    id: 'evt-6',
    time: '2026-02-26T08:08:00',
    event_type: 'visit_start',
    description: 'Visit started with Sandra Williams',
    patient_name: 'Sandra Williams',
    provider_name: 'Dr. Rivera',
    site_name: 'Lakewood',
  },
  {
    id: 'evt-7',
    time: '2026-02-26T08:30:00',
    event_type: 'visit_end',
    description: 'Visit completed with Linda Martinez',
    patient_name: 'Linda Martinez',
    provider_name: 'Dr. Chen',
    site_name: 'Riverview',
  },
  {
    id: 'evt-8',
    time: '2026-02-26T08:32:00',
    event_type: 'note_signed',
    description: 'Note signed for Linda Martinez',
    patient_name: 'Linda Martinez',
    provider_name: 'Dr. Chen',
    site_name: 'Riverview',
  },
  {
    id: 'evt-9',
    time: '2026-02-26T08:35:00',
    event_type: 'visit_end',
    description: 'Visit completed with Dorothy Chen',
    patient_name: 'Dorothy Chen',
    provider_name: 'Dr. Patel',
    site_name: 'Riverview',
  },
  {
    id: 'evt-10',
    time: '2026-02-26T08:35:00',
    event_type: 'cancelled',
    description: 'Rivera 8:30 appointment cancelled',
    patient_name: null,
    provider_name: 'Dr. Rivera',
    site_name: 'Riverview',
  },
  {
    id: 'evt-11',
    time: '2026-02-26T08:38:00',
    event_type: 'visit_end',
    description: 'Visit completed with Sandra Williams',
    patient_name: 'Sandra Williams',
    provider_name: 'Dr. Rivera',
    site_name: 'Lakewood',
  },
  {
    id: 'evt-12',
    time: '2026-02-26T09:00:00',
    event_type: 'historian_completed',
    description: 'AI Historian completed for Robert Kim (gold standard)',
    patient_name: 'Robert Kim',
    provider_name: 'Dr. Patel',
    site_name: 'Lakewood',
  },
  {
    id: 'evt-13',
    time: '2026-02-26T09:05:00',
    event_type: 'visit_start',
    description: 'Visit started with James Okonkwo',
    patient_name: 'James Okonkwo',
    provider_name: 'Dr. Rivera',
    site_name: 'Riverview',
  },
  {
    id: 'evt-14',
    time: '2026-02-26T09:15:00',
    event_type: 'no_show',
    description: 'Carlos Delgado no-show — urgent GBS evaluation',
    patient_name: 'Carlos Delgado',
    provider_name: 'Dr. Chen',
    site_name: 'Riverview',
  },
  {
    id: 'evt-15',
    time: '2026-02-26T09:35:00',
    event_type: 'vitals_done',
    description: 'Vitals completed for Chen Dongyue at Riverview',
    patient_name: 'Chen Dongyue',
    provider_name: 'Dr. Rivera',
    site_name: 'Riverview',
  },
]

// --- Operational alerts (sorted by severity) -----------------------------------

export const DEMO_OPERATIONAL_ALERTS: OperationalAlert[] = [
  {
    id: 'alert-1',
    severity: 'critical',
    title: 'No-show: Carlos Delgado (GBS suspect)',
    description:
      'Urgent new patient with progressive leg weakness did not arrive for 9:00 appointment. Safety concern — needs outreach.',
    related_provider: 'Dr. Chen',
    related_patient: 'Carlos Delgado',
    timestamp: '2026-02-26T09:15:00',
  },
  {
    id: 'alert-2',
    severity: 'warning',
    title: 'Dr. Rivera running +8 min behind',
    description:
      'Complex post-seizure case (Okonkwo) running over. Next patient (Dongyue) prepped and waiting.',
    related_provider: 'Dr. Rivera',
    related_patient: null,
    timestamp: '2026-02-26T09:40:00',
  },
  {
    id: 'alert-3',
    severity: 'warning',
    title: '3 patients missing pre-visit data',
    description:
      'Price (Chen 10:30), Moore (Patel 10:30), Park (Rivera 11:00) have no historian or chart prep data.',
    related_provider: null,
    related_patient: null,
    timestamp: '2026-02-26T09:00:00',
  },
  {
    id: 'alert-4',
    severity: 'info',
    title: 'Maria Santos — video connection issue',
    description:
      'Home visit patient checked in but video not connecting. Virtual MA Sarah troubleshooting.',
    related_provider: 'Dr. Chen',
    related_patient: 'Maria Santos',
    timestamp: '2026-02-26T09:28:00',
  },
]
