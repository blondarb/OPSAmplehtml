'use client'

// Re-export from modular appointments architecture
// This wrapper maintains backward compatibility with ClinicalNote.tsx imports
export { default } from './appointments/AppointmentsDashboard'
export type { Appointment, AppointmentPatient } from './appointments/appointmentUtils'
