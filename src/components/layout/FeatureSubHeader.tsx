'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureSubHeaderProps {
  title: string
  icon: LucideIcon
  accentColor: string
  showDemo?: boolean
  badgeText?: string
  badgeBg?: string
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
  badgeText,
  badgeBg,
  homeLink = '/',
  nextStep,
}: FeatureSubHeaderProps) {
  return (
    <div
      className="feature-sub-header"
      style={{
        background: accentColor,
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minHeight: 48,
      }}
    >
      <Link
        href={homeLink}
        className="fsh-link"
        style={{
          color: 'white',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 14,
          fontWeight: 500,
          opacity: 0.9,
          flexShrink: 0,
        }}
      >
        <ChevronLeft size={16} />
        <span className="fsh-link-label">Home</span>
      </Link>

      <div
        className="fsh-title"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flex: '1 1 auto',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} color="white" />
        <span
          style={{
            color: 'white',
            fontWeight: 600,
            fontSize: 15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {title}
        </span>
        {(showDemo || badgeText) && (
          <span
            style={{
              background: badgeBg || 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            {badgeText || 'Demo'}
          </span>
        )}
      </div>

      {nextStep ? (
        <Link
          href={nextStep.route}
          className="fsh-link"
          style={{
            color: 'white',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 14,
            fontWeight: 500,
            opacity: 0.9,
            flexShrink: 0,
          }}
        >
          <span className="fsh-link-label">{nextStep.label}</span>
          <ChevronRight size={16} />
        </Link>
      ) : (
        <div style={{ width: 32, flexShrink: 0 }} />
      )}

      <style jsx>{`
        @media (max-width: 640px) {
          .feature-sub-header {
            padding: 8px 10px !important;
          }
          :global(.fsh-link-label) {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
