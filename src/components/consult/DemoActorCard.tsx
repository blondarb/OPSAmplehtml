'use client'

import type { SamplePersona } from '@/lib/consult/samplePersonas'

interface DemoActorCardProps {
  persona: SamplePersona
  compact?: boolean
}

export default function DemoActorCard({ persona, compact }: DemoActorCardProps) {
  return (
    <aside
      style={{
        background: '#1E293B',
        border: `1px solid ${persona.accentColor}40`,
        borderRadius: 12,
        padding: compact ? 16 : 20,
        position: 'sticky',
        top: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            padding: '3px 8px',
            borderRadius: 6,
            background: persona.accentBg,
            color: persona.accentColor,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Demo Briefing
        </span>
        <span style={{ color: '#64748B', fontSize: 11 }}>For the person acting</span>
      </div>

      <h4
        style={{
          color: '#E2E8F0',
          fontSize: 18,
          fontWeight: 700,
          margin: '10px 0 2px',
        }}
      >
        Play {persona.name}
      </h4>
      <p style={{ color: '#94A3B8', fontSize: 12, margin: '0 0 14px' }}>
        {persona.age}
        {persona.sex} · {persona.occupation}
      </p>

      {/* Demeanor */}
      <Section label="How to act" accent={persona.accentColor}>
        <p style={{ color: '#CBD5E1', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
          {persona.briefing.demeanor}
        </p>
      </Section>

      {/* Opening cue */}
      <Section label="Opening cue (if you need one)" accent={persona.accentColor}>
        <p
          style={{
            color: '#E2E8F0',
            fontSize: 13,
            lineHeight: 1.55,
            margin: 0,
            padding: '10px 12px',
            borderLeft: `2px solid ${persona.accentColor}`,
            background: persona.accentBg,
            borderRadius: 4,
            fontStyle: 'italic',
          }}
        >
          {persona.briefing.openingCue}
        </p>
      </Section>

      {/* Key facts */}
      <Section label="Facts you can share" accent={persona.accentColor}>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: '#CBD5E1',
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {persona.briefing.keyFacts.map((fact, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {fact}
            </li>
          ))}
        </ul>
      </Section>

      {/* Optional color */}
      {persona.briefing.optionalColor.length > 0 && (
        <Section label="Optional color" accent={persona.accentColor}>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: '#94A3B8',
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            {persona.briefing.optionalColor.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Footer note */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px dashed #334155',
          color: '#64748B',
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        Stay in character as loosely or tightly as you like. Be vague, go off
        script, contradict yourself — the Historian adapts. Every interview is
        individualized.
      </div>
    </aside>
  )
}

function Section({
  label,
  accent,
  children,
}: {
  label: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          color: accent,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
