'use client'

import { useState, useEffect, useRef } from 'react'

interface Phrase {
  id: string
  trigger_text: string
  expansion_text: string
  category: string | null
  description: string | null
  scope: 'global' | 'hpi' | 'assessment' | 'plan' | 'ros' | 'allergies'
  use_count: number
}

interface InlinePhrasePickerProps {
  fieldName: string
  onInsertPhrase: (text: string) => void
  onOpenFullDrawer: () => void
}

export default function InlinePhrasePicker({
  fieldName,
  onInsertPhrase,
  onOpenFullDrawer
}: InlinePhrasePickerProps) {
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPhrases()
  }, [fieldName])

  const fetchPhrases = async () => {
    try {
      const response = await fetch('/api/phrases')
      if (response.ok) {
        const data = await response.json()
        setPhrases(data.phrases || [])
      }
    } catch (error) {
      console.error('Error fetching phrases:', error)
    } finally {
      setLoading(false)
    }
  }

  const trackUsage = async (phraseId: string) => {
    try {
      await fetch(`/api/phrases/${phraseId}`, { method: 'PATCH' })
    } catch (error) {
      console.error('Error tracking usage:', error)
    }
  }

  const handleInsert = (phrase: Phrase) => {
    onInsertPhrase(phrase.expansion_text)
    trackUsage(phrase.id)
  }

  // Filter phrases by scope (relevant to field + global)
  const filteredPhrases = phrases
    .filter(p => {
      // Include global phrases and field-specific phrases
      const scopeMatch = p.scope === 'global' || p.scope === fieldName
      // Include search term filter
      const searchMatch = !searchTerm ||
        p.trigger_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.expansion_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
      return scopeMatch && searchMatch
    })
    .sort((a, b) => {
      // Sort by use_count (most used first), then by trigger
      if (b.use_count !== a.use_count) return b.use_count - a.use_count
      return a.trigger_text.localeCompare(b.trigger_text)
    })
    .slice(0, 5) // Show only top 5

  const scopeLabel = fieldName.toUpperCase()

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: '0',
        marginTop: '4px',
        width: '320px',
        background: 'var(--bg-white)',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        border: '1px solid var(--border)',
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-gray)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Quick Phrases
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--primary)',
            color: 'white',
            fontWeight: 500,
          }}>
            {scopeLabel}
          </span>
        </div>
        <button
          onClick={onOpenFullDrawer}
          style={{
            fontSize: '11px',
            color: 'var(--primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          View All →
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Type to filter..."
          style={{
            width: '100%',
            padding: '6px 10px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            outline: 'none',
            background: 'var(--bg-white)',
          }}
        />
      </div>

      {/* Phrase List */}
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            Loading...
          </div>
        ) : filteredPhrases.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            No phrases found for this field
          </div>
        ) : (
          filteredPhrases.map(phrase => (
            <div
              key={phrase.id}
              onClick={() => handleInsert(phrase)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-gray)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-white)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px',
              }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--primary)',
                  fontFamily: 'monospace',
                }}>
                  {phrase.trigger_text}
                </span>
                {phrase.scope !== 'global' && (
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: 'var(--error)',
                    color: 'white',
                    fontWeight: 500,
                  }}>
                    {phrase.scope.toUpperCase()}
                  </span>
                )}
                {phrase.scope === 'global' && (
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: 'var(--success)',
                    color: 'white',
                    fontWeight: 500,
                  }}>
                    GLOBAL
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {phrase.expansion_text.substring(0, 80)}
                {phrase.expansion_text.length > 80 && '...'}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--bg-gray)',
        borderTop: '1px solid var(--border)',
        fontSize: '10px',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        Click to insert • Type <code style={{ background: 'var(--bg-dark)', padding: '1px 4px', borderRadius: '3px' }}>.trigger</code> in field
      </div>
    </div>
  )
}
