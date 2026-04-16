import {
  Brain, CalendarClock, Activity, Stethoscope,
  ClipboardList, Mic, MessageCircle, HeartPulse,
  MessageSquare, Watch, LayoutDashboard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface JourneyCardData {
  phase: string
  name: string
  route: string
  icon: LucideIcon
  status: 'live' | 'building' | 'planned'
  description: string
}

export interface JourneyTrackData {
  title: string
  subtitle: string
  cards: JourneyCardData[]
}

export const clinicianTrack: JourneyTrackData = {
  title: 'The Clinician Journey',
  subtitle: 'From referral to exam — AI at every step',
  cards: [
    {
      phase: 'Referral Triage',
      name: 'AI-Powered Triage',
      route: '/triage',
      icon: Brain,
      status: 'live',
      description: 'A referral arrives. AI reads it, scores acuity, and routes to the right subspecialist.',
    },
    {
      phase: 'Intake Pipeline',
      name: 'Neuro Intake Engine',
      route: '/consult',
      icon: ClipboardList,
      status: 'live',
      description: 'Referral → AI triage → AI voice historian → patient tools → unified report. Five sample patients ready to demo.',
    },
    {
      phase: 'My Day',
      name: 'Clinician Cockpit',
      route: '/physician',
      icon: CalendarClock,
      status: 'live',
      description: 'Morning briefing, today\'s schedule, and priority notifications — your clinical home base.',
    },
    {
      phase: 'Documentation',
      name: 'Documentation',
      route: '/ehr',
      icon: Stethoscope,
      status: 'live',
      description: 'Full clinical documentation with AI-assisted note creation, voice dictation, and clinical scales.',
    },
    {
      phase: 'In-Office Exam',
      name: 'Digital Neurological Exam',
      route: '/sdne',
      icon: Activity,
      status: 'live',
      description: 'The exam that remembers everything — quantified, reproducible, trackable over time.',
    },
  ],
}

export const patientTrack: JourneyTrackData = {
  title: 'The Patient Journey',
  subtitle: 'Guided care before, during, and after every visit',
  cards: [
    {
      phase: 'Before the Visit',
      name: 'Patient Intake',
      route: '/patient?tab=intake',
      icon: ClipboardList,
      status: 'live',
      description: 'Complete your intake forms and medical history before your appointment.',
    },
    {
      phase: 'AI History-Taking',
      name: 'AI Health Interview',
      route: '/patient/historian',
      icon: Mic,
      status: 'live',
      description: 'Have a voice conversation with an AI that takes your neurological history.',
    },
    {
      phase: 'Between Visits',
      name: 'Patient Messaging',
      route: '/patient/messages',
      icon: MessageCircle,
      status: 'live',
      description: 'Send questions and updates to your care team — with AI-assisted message composition.',
    },
    {
      phase: 'After the Visit',
      name: 'Post-Visit Check-In',
      route: '/follow-up/conversation',
      icon: HeartPulse,
      status: 'live',
      description: 'Your AI care coordinator follows up on how you\'re feeling after your visit.',
    },
  ],
}

export const ongoingCareTrack: JourneyTrackData = {
  title: 'Ongoing Care',
  subtitle: 'Continuous intelligence between the 30-minute visits',
  cards: [
    {
      phase: 'Operations',
      name: 'Operations Dashboard',
      route: '/dashboard',
      icon: LayoutDashboard,
      status: 'live',
      description: 'Practice-wide operational intelligence — staffing, action queue, and patient priority across all providers.',
    },
    {
      phase: 'Post-Visit',
      name: 'AI Follow-Up Agent',
      route: '/follow-up',
      icon: MessageSquare,
      status: 'live',
      description: 'AI care coordination — track medication tolerance, symptoms, and escalation alerts.',
    },
    {
      phase: 'Between Visits',
      name: 'Wearable Monitoring',
      route: '/wearable',
      icon: Watch,
      status: 'live',
      description: 'Galaxy Watch + AI turn the months between visits into actionable clinical intelligence.',
    },
  ],
}
