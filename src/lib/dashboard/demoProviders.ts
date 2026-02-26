// ──────────────────────────────────────────────────────────────────────────────
// Demo Data: Providers, Clinic Sites, Virtual MAs
// Snapshot at ~9:40 AM, 2026-02-26
// Design doc: docs/plans/2026-02-26-role-based-dashboards-plan.md
// ──────────────────────────────────────────────────────────────────────────────

import type { Provider, ClinicSite, VirtualMA } from './types'

// --- Providers ----------------------------------------------------------------

export const DEMO_PROVIDERS: Provider[] = [
  {
    id: 'prov-chen',
    name: 'Dr. Anita Chen',
    credentials: 'MD',
    specialty: 'general_neurology',
    status: 'available',
    current_patient_id: null,
    next_patient_time: '2026-02-26T09:30:00',
    stats: { seen_today: 2, remaining_today: 5, running_behind_minutes: 0 },
  },
  {
    id: 'prov-patel',
    name: 'Dr. Raj Patel',
    credentials: 'DO',
    specialty: 'headache',
    status: 'in_visit',
    current_patient_id: 'pt-kim',
    next_patient_time: '2026-02-26T09:30:00',
    stats: { seen_today: 2, remaining_today: 5, running_behind_minutes: 0 },
  },
  {
    id: 'prov-rivera',
    name: 'Dr. Sofia Rivera',
    credentials: 'MD',
    specialty: 'ms_neuroimmunology',
    status: 'in_visit',
    current_patient_id: 'pt-okonkwo',
    next_patient_time: '2026-02-26T09:30:00',
    stats: { seen_today: 2, remaining_today: 4, running_behind_minutes: 8 },
  },
]

// --- Clinic Sites -------------------------------------------------------------

export const DEMO_CLINIC_SITES: ClinicSite[] = [
  {
    id: 'site-riverview',
    name: 'Riverview Neurology',
    location: 'Portland, OR',
    timezone: 'America/Los_Angeles',
    providers_today: 3,
    patients_today: 8,
    local_ma_on_site: true,
    local_ma_name: 'Jessica',
    ehr_integration: 'epic_fhir',
  },
  {
    id: 'site-lakewood',
    name: 'Lakewood Medical',
    location: 'Lake Oswego, OR',
    timezone: 'America/Los_Angeles',
    providers_today: 2,
    patients_today: 6,
    local_ma_on_site: true,
    local_ma_name: 'Andrea',
    ehr_integration: 'cerner_fhir',
  },
  {
    id: 'site-home',
    name: 'Home Visits',
    location: 'Various',
    timezone: 'America/Los_Angeles',
    providers_today: 3,
    patients_today: 4,
    local_ma_on_site: false,
    local_ma_name: null,
    ehr_integration: 'none',
  },
]

// --- Virtual MAs --------------------------------------------------------------

export const DEMO_VIRTUAL_MAS: VirtualMA[] = [
  {
    id: 'vma-sarah',
    name: 'Sarah',
    assigned_provider_ids: ['prov-chen', 'prov-patel'],
    role: 'primary',
    active_task_count: 4,
  },
  {
    id: 'vma-marcus',
    name: 'Marcus',
    assigned_provider_ids: ['prov-rivera'],
    role: 'primary',
    active_task_count: 3,
  },
]
