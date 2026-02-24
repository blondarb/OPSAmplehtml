'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'

const metrics = [
  { value: '6', suffix: ' months', label: 'Average wait for new neurology patients' },
  { value: '30', suffix: '%', label: 'Referrals misdirected to wrong subspecialty' },
  { value: '$100', suffix: '+', label: 'Monthly RPM revenue per patient left on the table' },
  { value: '24', suffix: '/7', label: 'AI monitoring between 30-minute visits' },
]

function CountUpMetric({ value, suffix, label }: { value: string; suffix: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [display, setDisplay] = useState(value.startsWith('$') ? '$0' : '0')

  useEffect(() => {
    if (!isInView) return

    const numericPart = value.replace(/[^0-9]/g, '')
    const prefix = value.startsWith('$') ? '$' : ''
    const target = parseInt(numericPart, 10)
    const duration = 1000
    const steps = 30
    const stepTime = duration / steps

    let current = 0
    const increment = target / steps

    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        current = target
        clearInterval(timer)
      }
      setDisplay(`${prefix}${Math.round(current)}`)
    }, stepTime)

    return () => clearInterval(timer)
  }, [isInView, value])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className="text-center"
    >
      <div className="text-4xl md:text-5xl font-bold text-teal-400">
        {display}<span>{suffix}</span>
      </div>
      <p className="mt-2 text-sm text-slate-400">{label}</p>
    </motion.div>
  )
}

export default function ByTheNumbers() {
  return (
    <section className="bg-slate-900 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">By the Numbers</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {metrics.map((m) => (
            <CountUpMetric key={m.label} {...m} />
          ))}
        </div>
      </div>
    </section>
  )
}
