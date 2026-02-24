'use client'

import PlatformShell from '@/components/layout/PlatformShell'
import HeroSection from '@/components/homepage/HeroSection'
import JourneyTrack from '@/components/homepage/JourneyTrack'
import { clinicianTrack, patientTrack, ongoingCareTrack } from '@/components/homepage/journeyData'
import ByTheNumbers from '@/components/homepage/ByTheNumbers'
import BuiltWith from '@/components/homepage/BuiltWith'
import Footer from '@/components/homepage/Footer'

export default function Home() {
  return (
    <PlatformShell>
      <HeroSection />

      <div id="journey" className="bg-slate-50">
        <JourneyTrack track={clinicianTrack} />
        <JourneyTrack track={patientTrack} />
        <JourneyTrack track={ongoingCareTrack} />
      </div>

      <ByTheNumbers />
      <BuiltWith />
      <Footer />
    </PlatformShell>
  )
}
