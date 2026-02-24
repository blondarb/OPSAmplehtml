'use client'

import { motion } from 'framer-motion'

export default function HeroSection() {
  const scrollToJourney = () => {
    document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center px-6 py-20"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #134e4a 100%)' }}>

      <div className="max-w-3xl mx-auto text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight"
        >
          The Neurology Clinic of Tomorrow — Built Today
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed"
        >
          From the first referral to years of continuous monitoring, this platform
          reimagines every step of outpatient neurology with AI. Intelligent triage
          gets the right patient to the right neurologist faster. A digital neurological
          exam makes the subjective objective. AI agents follow up after every visit.
          And wearable data turns the time between appointments into actionable
          clinical intelligence.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8"
        >
          <button
            onClick={scrollToJourney}
            className="px-8 py-3 rounded-lg border border-white text-white font-medium hover:bg-white/10 transition-colors"
          >
            Follow a Patient&apos;s Journey ↓
          </button>
        </motion.div>
      </div>
    </section>
  )
}
