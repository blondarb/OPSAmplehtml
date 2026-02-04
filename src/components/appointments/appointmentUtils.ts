// Shared types, constants, and helpers for appointment views

// Types for appointments from API
export interface AppointmentPatient {
  id: string
  mrn: string
  firstName: string
  lastName: string
  name: string
  dateOfBirth: string
  age: number | null
  gender: string
  phone: string
  email: string
  referringPhysician: string | null
  referralReason: string | null
}

export interface Appointment {
  id: string
  appointmentDate: string
  appointmentTime: string
  durationMinutes: number
  appointmentType: string
  status: string
  hospitalSite: string
  reasonForVisit: string | null
  schedulingNotes: string | null
  visitId: string | null
  priorVisitId: string | null
  patient: AppointmentPatient | null
  priorVisit: {
    id: string
    visitDate: string
    visitType: string
    aiSummary: string | null
  } | null
}

export type CalendarViewMode = 'day' | 'week' | 'month'

export type AppointmentsByDate = Record<string, Appointment[]>

// Filter options
export const HOSPITAL_SITES = ['All', 'Meridian Neurology', 'New Media', 'CHH', 'Outpatient Center']
export const STATUSES = ['All', 'Scheduled', 'Confirmed', 'In-Progress', 'Completed', 'Cancelled']
export const APPOINTMENT_TYPES = ['All', 'new-consult', 'next-day', 'follow-up', '3-month-follow-up', '6-month-follow-up', '12-month-follow-up']

// Reason badge colors
export const REASON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'headache': { bg: '#F3E8FF', text: '#7C3AED', border: '#C4B5FD' },
  'migraine': { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  'weakness': { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' },
  'tremor': { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  'seizure': { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  'memory': { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' },
  'parkinson': { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  'stroke': { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' },
  'neuropathy': { bg: '#D1FAE5', text: '#047857', border: '#6EE7B7' },
  'sleep': { bg: '#E0E7FF', text: '#4338CA', border: '#A5B4FC' },
  'ms': { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  'multiple sclerosis': { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  'default': { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
}

// Type border colors for cards
export const TYPE_BORDER_COLORS: Record<string, string> = {
  'new-consult': '#EF4444',
  'next-day': '#F59E0B',
  'follow-up': '#0D9488',
  '3-month-follow-up': '#0D9488',
  '6-month-follow-up': '#0D9488',
  '12-month-follow-up': '#0D9488',
}

// Format type for display
export const formatType = (type: string): string => {
  switch (type) {
    case 'new-consult': return 'New Consult'
    case 'next-day': return 'Next Day'
    case 'follow-up': return 'Follow-up'
    case '3-month-follow-up': return '3 Month F/U'
    case '6-month-follow-up': return '6 Month F/U'
    case '12-month-follow-up': return '12 Month F/U'
    default: return type
  }
}

// Get color for reason
export const getReasonColor = (reason: string | null) => {
  if (!reason) return REASON_COLORS.default
  const lowerReason = reason.toLowerCase()
  for (const [key, color] of Object.entries(REASON_COLORS)) {
    if (key !== 'default' && lowerReason.includes(key)) return color
  }
  return REASON_COLORS.default
}

// Extract short reason from full reason text
export const getShortReason = (reason: string | null): string => {
  if (!reason) return 'General'
  const lowerReason = reason.toLowerCase()
  if (lowerReason.includes('headache') || lowerReason.includes('migraine')) return 'Headache'
  if (lowerReason.includes('parkinson')) return "Parkinson's"
  if (lowerReason.includes('weakness')) return 'Weakness'
  if (lowerReason.includes('tremor')) return 'Tremor'
  if (lowerReason.includes('seizure')) return 'Seizure'
  if (lowerReason.includes('memory') || lowerReason.includes('cognitive')) return 'Memory'
  if (lowerReason.includes('stroke')) return 'Stroke'
  if (lowerReason.includes('neuropathy')) return 'Neuropathy'
  if (lowerReason.includes('sleep') || lowerReason.includes('narcolepsy')) return 'Sleep'
  if (lowerReason.includes('ms') || lowerReason.includes('multiple sclerosis')) return 'MS'
  // Return first few words if no match
  return reason.split(' ').slice(0, 3).join(' ')
}

// Format date for display
export const formatDisplayDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Format time for display
export const formatTime = (dateStr: string, timeStr: string): string => {
  const date = new Date(`${dateStr}T${timeStr}`)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Format short time (for compact views)
export const formatShortTime = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const h = hours % 12 || 12
  const ampm = hours >= 12 ? 'p' : 'a'
  return minutes === 0 ? `${h}${ampm}` : `${h}:${minutes.toString().padStart(2, '0')}${ampm}`
}

// Timezone-safe date string conversion
export const toDateString = (date: Date): string => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Check if date is today
export const isToday = (date: Date): boolean => {
  const today = new Date()
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
}

// Check if two dates are the same day
export const isSameDay = (a: Date, b: Date): boolean => {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// Get week range (Monday to Sunday)
export const getWeekRange = (date: Date): { start: Date; end: Date; days: Date[] } => {
  const d = new Date(date)
  const dayOfWeek = d.getDay()
  // Shift so Monday=0, Sunday=6
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(d)
  monday.setDate(d.getDate() + mondayOffset)

  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    days.push(day)
  }

  return {
    start: days[0],
    end: days[6],
    days,
  }
}

// Get month range (6-row grid with adjacent month padding)
export const getMonthRange = (date: Date): { start: Date; end: Date; weeks: Date[][] } => {
  const year = date.getFullYear()
  const month = date.getMonth()

  // First day of the month
  const firstDay = new Date(year, month, 1)
  // Day of week (0=Sun, 1=Mon, ..., 6=Sat)
  const firstDayOfWeek = firstDay.getDay()
  // Offset to Monday start
  const startOffset = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek

  const gridStart = new Date(year, month, 1 + startOffset)

  const weeks: Date[][] = []
  const current = new Date(gridStart)

  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  return {
    start: weeks[0][0],
    end: weeks[5][6],
    weeks,
  }
}

// Get load level based on appointment count
export const getLoadLevel = (count: number): 'empty' | 'light' | 'normal' | 'heavy' => {
  if (count === 0) return 'empty'
  if (count <= 3) return 'light'
  if (count <= 8) return 'normal'
  return 'heavy'
}

// Load level colors
export const LOAD_LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  empty: { bg: 'transparent', text: 'var(--text-muted)' },
  light: { bg: '#D1FAE5', text: '#047857' },
  normal: { bg: 'transparent', text: 'var(--text-secondary)' },
  heavy: { bg: '#FEF3C7', text: '#B45309' },
}

// Format date range for week view header
export const formatWeekRange = (start: Date, end: Date): string => {
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const year = end.getFullYear()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
}

// Format month header
export const formatMonthHeader = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Group appointments by date
export const groupAppointmentsByDate = (appointments: Appointment[]): AppointmentsByDate => {
  const grouped: AppointmentsByDate = {}
  for (const appt of appointments) {
    if (!grouped[appt.appointmentDate]) {
      grouped[appt.appointmentDate] = []
    }
    grouped[appt.appointmentDate].push(appt)
  }
  // Sort each day's appointments by time
  for (const date in grouped) {
    grouped[date].sort((a, b) => a.appointmentTime.localeCompare(b.appointmentTime))
  }
  return grouped
}

// Filter appointments with shared logic
export const filterAppointments = (
  appointments: Appointment[],
  hospitalFilter: string,
  statusFilter: string,
  typeFilter: string,
): Appointment[] => {
  let result = [...appointments]

  if (hospitalFilter !== 'All') {
    result = result.filter(a => a.hospitalSite === hospitalFilter)
  }
  if (statusFilter !== 'All') {
    result = result.filter(a => a.status.toLowerCase() === statusFilter.toLowerCase())
  }
  if (typeFilter !== 'All') {
    result = result.filter(a => a.appointmentType === typeFilter)
  }

  return result
}

// Check if appointment is a follow-up type
export const isFollowUpType = (type: string): boolean => {
  return type.includes('follow-up') || type === 'next-day'
}

// Check if appointment is a new consult
export const isNewConsultType = (type: string): boolean => {
  return type === 'new-consult'
}
