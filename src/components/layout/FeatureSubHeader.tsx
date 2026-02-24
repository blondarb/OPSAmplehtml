'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureSubHeaderProps {
  title: string
  icon: LucideIcon
  accentColor: string
  showDemo?: boolean
  homeLink?: string
  nextStep?: {
    label: string
    route: string
  }
}

export default function FeatureSubHeader({
  title,
  icon: Icon,
  accentColor,
  showDemo = true,
  homeLink = '/',
  nextStep,
}: FeatureSubHeaderProps) {
  return (
    <div
      style={{
        background: accentColor,
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 48,
      }}
    >
      <Link
        href={homeLink}
        style={{
          color: 'white',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 14,
          fontWeight: 500,
          opacity: 0.9,
        }}
      >
        <ChevronLeft size={16} />
        Home
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={18} color="white" />
        <span style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>
          {title}
        </span>
        {showDemo && (
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              letterSpacing: 0.5,
            }}
          >
            Demo
          </span>
        )}
      </div>

      {nextStep ? (
        <Link
          href={nextStep.route}
          style={{
            color: 'white',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 14,
            fontWeight: 500,
            opacity: 0.9,
          }}
        >
          {nextStep.label}
          <ChevronRight size={16} />
        </Link>
      ) : (
        <div style={{ width: 60 }} />
      )}
    </div>
  )
}
