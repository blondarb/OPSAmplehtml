'use client'

import { motion } from 'framer-motion'
import JourneyCard from './JourneyCard'
import type { JourneyTrackData } from './journeyData'

export default function JourneyTrack({ track }: { track: JourneyTrackData }) {
  return (
    <div className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">{track.title}</h2>
          <p className="mt-2 text-slate-500">{track.subtitle}</p>
        </div>

        {/* Desktop: horizontal timeline */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Timeline line */}
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="absolute top-[7px] left-0 right-0 h-[2px] bg-slate-200 origin-left"
              style={{ marginLeft: '28px', marginRight: '28px' }}
            />

            {/* Phase labels + nodes + cards */}
            <div className="flex justify-between items-start">
              {track.cards.map((card, i) => (
                <div key={card.route} className="flex flex-col items-center" style={{ flex: 1 }}>
                  {/* Node dot */}
                  <div className="relative z-10 w-4 h-4 rounded-full bg-teal-500 border-2 border-white shadow-sm mb-2" />

                  {/* Phase label */}
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 mb-3 text-center">
                    {card.phase}
                  </span>

                  {/* Card */}
                  <JourneyCard card={card} index={i} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: vertical timeline */}
        <div className="md:hidden space-y-6">
          {track.cards.map((card, i) => (
            <div key={card.route} className="flex gap-4">
              {/* Vertical line + node */}
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow-sm flex-shrink-0" />
                {i < track.cards.length - 1 && <div className="w-[2px] flex-1 bg-slate-200 mt-1" />}
              </div>

              {/* Phase + card */}
              <div className="flex-1 pb-4">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-2">
                  {card.phase}
                </span>
                <JourneyCard card={card} index={i} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
