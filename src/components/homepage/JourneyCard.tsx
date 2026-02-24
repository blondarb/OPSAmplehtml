'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { JourneyCardData } from './journeyData'

const statusConfig = {
  live: { label: 'Live', color: 'bg-emerald-500' },
  building: { label: 'Building', color: 'bg-amber-500' },
  planned: { label: 'Planned', color: 'bg-slate-400' },
}

export default function JourneyCard({ card, index }: { card: JourneyCardData; index: number }) {
  const Icon = card.icon
  const status = statusConfig[card.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={card.route} className="block group">
        <div className="relative bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm
          transition-all duration-200 hover:-translate-y-1 hover:shadow-md
          w-56 md:w-56 min-h-[200px] flex flex-col">

          {/* Status badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${status.color}`} />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{status.label}</span>
          </div>

          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center mb-3">
            <Icon className="w-5 h-5 text-teal-600" />
          </div>

          {/* Title */}
          <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-2">
            {card.name}
          </h3>

          {/* Description */}
          <p className="text-xs text-slate-500 leading-relaxed flex-1">
            {card.description}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
