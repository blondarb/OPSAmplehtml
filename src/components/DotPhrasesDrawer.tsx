'use client'

import { useState, useEffect } from 'react'

type PhraseScope = 'global' | 'hpi' | 'assessment' | 'plan' | 'ros' | 'allergies'

interface DotPhrase {
  id: string
  trigger_text: string
  expansion_text: string
  category: string | null
  description: string | null
  use_count: number
  last_used: string | null
  scope: PhraseScope
}

interface DotPhrasesDrawerProps {
  isOpen: boolean
  onClose: () => void
  onInsertPhrase: (text: string) => void
  activeField?: string | null
}

const SCOPE_LABELS: Record<PhraseScope, string> = {
  global: 'All Fields',
  hpi: 'HPI Only',
  assessment: 'Assessment Only',
  plan: 'Plan Only',
  ros: 'ROS Only',
  allergies: 'Allergies Only'
}

const SCOPE_COLORS: Record<PhraseScope, string> = {
  global: '#6366f1',
  hpi: '#0d9488',
  assessment: '#f59e0b',
  plan: '#3b82f6',
  ros: '#8b5cf6',
  allergies: '#ef4444'
}

export default function DotPhrasesDrawer({
  isOpen,
  onClose,
  onInsertPhrase,
  activeField
}: DotPhrasesDrawerProps) {
  const [phrases, setPhrases] = useState<DotPhrase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'relevant'>('relevant')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPhrase, setEditingPhrase] = useState<DotPhrase | null>(null)

  // Form state
  const [formTrigger, setFormTrigger] = useState('')
  const [formExpansion, setFormExpansion] = useState('')
  const [formCategory, setFormCategory] = useState('General')
  const [formDescription, setFormDescription] = useState('')
  const [formScope, setFormScope] = useState<PhraseScope>('global')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load phrases on mount
  useEffect(() => {
    if (isOpen) {
      loadPhrases()
      // Set default scope based on active field
      if (activeField) {
        const fieldScope = activeField as PhraseScope
        if (['hpi', 'assessment', 'plan', 'ros', 'allergies'].includes(fieldScope)) {
          setFormScope(fieldScope)
        }
      }
    }
  }, [isOpen, activeField])

  const loadPhrases = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/phrases')
      const data = await response.json()

      if (!response.ok) {
        // Check for specific errors
        if (response.status === 401) {
          setLoadError('Please log in to use dot phrases.')
        } else if (data.error?.includes('does not exist')) {
          setLoadError('Database not set up. Please run migrations: 003_dot_phrases.sql and 004_dot_phrases_scope.sql in Supabase SQL Editor.')
        } else {
          setLoadError(data.error || 'Failed to load phrases')
        }
        return
      }

      if (data.phrases) {
        setPhrases(data.phrases)
        // If no phrases, seed defaults
        if (data.phrases.length === 0) {
          await seedDefaultPhrases()
        }
      }
    } catch (error) {
      console.error('Failed to load phrases:', error)
      setLoadError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const seedDefaultPhrases = async () => {
    try {
      const response = await fetch('/api/phrases/seed', { method: 'POST' })
      const data = await response.json()
      if (data.seeded) {
        await loadPhrases()
      }
    } catch (error) {
      console.error('Failed to seed phrases:', error)
    }
  }

  const categories = ['All', ...new Set(phrases.map(p => p.category || 'General'))]

  const filteredPhrases = phrases.filter(phrase => {
    const matchesSearch =
      searchTerm === '' ||
      phrase.trigger_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phrase.expansion_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phrase.description?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory =
      selectedCategory === 'All' || phrase.category === selectedCategory

    // Scope filtering - show global phrases + phrases matching the active field
    const matchesScope = scopeFilter === 'all' ||
      phrase.scope === 'global' ||
      (activeField && phrase.scope === activeField)

    return matchesSearch && matchesCategory && matchesScope
  })

  const handleInsert = async (phrase: DotPhrase) => {
    onInsertPhrase(phrase.expansion_text)
    // Track usage
    try {
      await fetch(`/api/phrases/${phrase.id}`, { method: 'PATCH' })
    } catch (error) {
      console.error('Failed to track phrase usage:', error)
    }
    onClose()
  }

  const handleSavePhrase = async () => {
    setFormError('')
    if (!formTrigger.trim() || !formExpansion.trim()) {
      setFormError('Trigger and expansion text are required')
      return
    }

    setSaving(true)
    try {
      const url = editingPhrase
        ? `/api/phrases/${editingPhrase.id}`
        : '/api/phrases'
      const method = editingPhrase ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_text: formTrigger,
          expansion_text: formExpansion,
          category: formCategory,
          description: formDescription,
          scope: formScope
        })
      })

      const data = await response.json()
      if (!response.ok) {
        setFormError(data.error || 'Failed to save phrase')
        return
      }

      await loadPhrases()
      resetForm()
    } catch (error) {
      setFormError('Failed to save phrase')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePhrase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this phrase?')) return

    try {
      await fetch(`/api/phrases/${id}`, { method: 'DELETE' })
      await loadPhrases()
    } catch (error) {
      console.error('Failed to delete phrase:', error)
    }
  }

  const handleEditPhrase = (phrase: DotPhrase) => {
    setEditingPhrase(phrase)
    setFormTrigger(phrase.trigger_text)
    setFormExpansion(phrase.expansion_text)
    setFormCategory(phrase.category || 'General')
    setFormDescription(phrase.description || '')
    setFormScope(phrase.scope || 'global')
    setShowAddForm(true)
  }

  const resetForm = () => {
    setShowAddForm(false)
    setEditingPhrase(null)
    setFormTrigger('')
    setFormExpansion('')
    setFormCategory('General')
    setFormDescription('')
    setFormScope(activeField as PhraseScope || 'global')
    setFormError('')
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999
        }}
      />

      {/* Drawer */}
      <div
        className="ai-drawer show"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '450px',
          maxWidth: '100vw', // Responsive: never exceed viewport
          height: '100vh',
          backgroundColor: 'var(--bg-white)',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-gray)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Dot Phrases
              </h2>
              {activeField && (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Field: {activeField.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* Search and Filter */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Search phrases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              marginBottom: '12px',
              backgroundColor: 'var(--bg-white)',
              color: 'var(--text-primary)'
            }}
          />

          {/* Scope Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => setScopeFilter('relevant')}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                backgroundColor: scopeFilter === 'relevant' ? 'var(--primary)' : 'var(--bg-white)',
                color: scopeFilter === 'relevant' ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              Relevant to Field
            </button>
            <button
              onClick={() => setScopeFilter('all')}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                backgroundColor: scopeFilter === 'all' ? 'var(--primary)' : 'var(--bg-white)',
                color: scopeFilter === 'all' ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.15s ease'
              }}
            >
              Show All
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: selectedCategory === category ? 'var(--primary)' : 'var(--bg-white)',
                  color: selectedCategory === category ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Add New Button */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => {
              resetForm()
              setShowAddForm(true)
            }}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>+</span> New Phrase
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          {showAddForm ? (
            /* Add/Edit Form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Trigger (e.g., .exam)
                </label>
                <input
                  type="text"
                  value={formTrigger}
                  onChange={(e) => setFormTrigger(e.target.value)}
                  placeholder=".trigger"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    backgroundColor: 'var(--bg-white)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Expansion Text
                </label>
                <textarea
                  value={formExpansion}
                  onChange={(e) => setFormExpansion(e.target.value)}
                  placeholder="The text that will be inserted..."
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    backgroundColor: 'var(--bg-white)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: 'var(--bg-white)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="General">General</option>
                    <option value="Physical Exam">Physical Exam</option>
                    <option value="ROS">ROS</option>
                    <option value="Assessment">Assessment</option>
                    <option value="Plan">Plan</option>
                    <option value="Allergies">Allergies</option>
                    <option value="HPI">HPI</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    Scope
                  </label>
                  <select
                    value={formScope}
                    onChange={(e) => setFormScope(e.target.value as PhraseScope)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: 'var(--bg-white)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="global">All Fields (Global)</option>
                    <option value="hpi">HPI Only</option>
                    <option value="assessment">Assessment Only</option>
                    <option value="plan">Plan Only</option>
                    <option value="ros">ROS Only</option>
                    <option value="allergies">Allergies Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'var(--bg-white)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {formError && (
                <div style={{
                  padding: '10px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  borderRadius: '6px',
                  fontSize: '13px'
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={resetForm}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--bg-gray)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePhrase}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? 'Saving...' : editingPhrase ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading phrases...
            </div>
          ) : loadError ? (
            <div style={{
              padding: '20px',
              margin: '20px 0',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Error Loading Phrases</div>
              <div style={{ fontSize: '13px', lineHeight: 1.5 }}>{loadError}</div>
              <button
                onClick={loadPhrases}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            </div>
          ) : filteredPhrases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              {searchTerm ? 'No phrases match your search' : scopeFilter === 'relevant' ? 'No phrases for this field. Try "Show All" or add a new one!' : 'No phrases yet. Add your first one!'}
            </div>
          ) : (
            /* Phrases List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredPhrases.map(phrase => (
                <div
                  key={phrase.id}
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-gray)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => handleInsert(phrase)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)'
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(13, 148, 136, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--primary)',
                        backgroundColor: 'rgba(13, 148, 136, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {phrase.trigger_text}
                      </code>
                      {/* Scope badge */}
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: `${SCOPE_COLORS[phrase.scope || 'global']}20`,
                        color: SCOPE_COLORS[phrase.scope || 'global'],
                        fontWeight: 500
                      }}>
                        {phrase.scope === 'global' ? '🌐' : '📍'} {SCOPE_LABELS[phrase.scope || 'global']}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleEditPhrase(phrase)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePhrase(phrase.id)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: 'transparent',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: '#dc2626'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {phrase.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      {phrase.description}
                    </div>
                  )}
                  <div style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.4,
                    maxHeight: '60px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {phrase.expansion_text}
                  </div>
                  <div style={{
                    marginTop: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--text-secondary)'
                  }}>
                    <span style={{
                      padding: '2px 6px',
                      backgroundColor: 'var(--bg-white)',
                      borderRadius: '4px'
                    }}>
                      {phrase.category || 'General'}
                    </span>
                    <span>Used {phrase.use_count || 0} times</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Help */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-gray)',
          fontSize: '12px',
          color: 'var(--text-secondary)'
        }}>
          <strong>Tip:</strong> Use <span style={{ color: SCOPE_COLORS.global }}>🌐 Global</span> phrases in any field, or create <span style={{ color: 'var(--primary)' }}>📍 Field-specific</span> phrases that only appear where you need them.
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  )
}
