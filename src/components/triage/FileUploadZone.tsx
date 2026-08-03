'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { applyReferralFileSelection } from '@/lib/triage/referralFileSelection'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

interface FileUploadZoneProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  onExternalFilesChange: (files: File[]) => void
  onExternalFilesConsumed: () => void
  disabled?: boolean
  externalFiles?: File[]  // Files injected from demo loader
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.substring(dot).toLowerCase()
}

function getTypeBadge(name: string): { label: string; color: string } {
  const ext = getFileExtension(name)
  switch (ext) {
    case '.pdf': return { label: 'PDF', color: '#DC2626' }
    case '.docx': return { label: 'DOCX', color: '#2563EB' }
    case '.txt': return { label: 'TXT', color: '#6B7280' }
    default: return { label: ext.toUpperCase() || '?', color: '#6B7280' }
  }
}

export default function FileUploadZone({
  files,
  onFilesChange,
  onExternalFilesChange,
  onExternalFilesConsumed,
  disabled,
  externalFiles,
}: FileUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles)
    const transition = applyReferralFileSelection(incoming, onFilesChange)
    setErrors(transition.error ? [transition.error] : [])
  }, [onFilesChange])

  const addExternalFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles)
    const transition = applyReferralFileSelection(
      incoming,
      onExternalFilesChange,
    )
    setErrors(transition.error ? [transition.error] : [])
  }, [onExternalFilesChange])

  // Demo-loader files cross the same exact-one and validation boundary as
  // browser-selected files. An omitted prop means no external selection event.
  useEffect(() => {
    if (externalFiles === undefined) return
    addExternalFiles(externalFiles)
    onExternalFilesConsumed()
  }, [addExternalFiles, externalFiles, onExternalFilesConsumed])

  const removeFile = useCallback((index: number) => {
    const updated = files.filter((_, i) => i !== index)
    onFilesChange(updated)
    setErrors([])
  }, [files, onFilesChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    addFiles(e.dataTransfer.files)
  }, [addFiles, disabled])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }, [disabled])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files ?? [])
    e.target.value = '' // reset so same file can be re-added
  }, [addFiles])

  return (
    <div>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--nn-accent)' : 'var(--nn-line)'}`,
          borderRadius: 'var(--nn-radius)',
          padding: '32px 24px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: dragOver ? 'var(--nn-accent-wash)' : disabled ? 'var(--nn-surface-2)' : 'var(--nn-surface)',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={dragOver ? 'var(--nn-accent)' : 'var(--nn-ink-3)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p style={{ color: 'var(--nn-ink)', fontWeight: 500, marginBottom: '4px', margin: '0 0 4px 0' }}>
          {dragOver ? 'Drop referral file here' : 'Drag & drop a referral file here'}
        </p>
        <p style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-sm)', marginBottom: '12px', margin: '0 0 12px 0' }}>
          or click to browse
        </p>
        <p style={{ color: 'var(--nn-ink-3)', fontSize: 'var(--nn-fs-xs)', margin: 0 }}>
          PDF, DOCX, or TXT &mdash; one referral packet up to {FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(',')}
          onChange={handleInputChange}
          style={{ display: 'none' }}
          disabled={disabled}
        />
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          {errors.map((err, i) => (
            <p key={i} className="nn-alert" style={{ margin: '0 0 6px' }}>
              {err}
            </p>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {files.map((file, index) => {
            const badge = getTypeBadge(file.name)
            return (
              <div
                key={`${file.name}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--nn-radius)',
                  backgroundColor: 'var(--nn-surface-2)',
                  border: '1px solid var(--nn-line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      backgroundColor: badge.color,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      flexShrink: 0,
                      minWidth: '36px',
                      textAlign: 'center',
                    }}
                  >
                    {badge.label}
                  </span>
                  <span style={{
                    fontSize: 'var(--nn-fs-sm)',
                    color: 'var(--nn-ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {file.name}
                  </span>
                  <span style={{ fontSize: 'var(--nn-fs-xs)', color: 'var(--nn-ink-3)', flexShrink: 0 }}>
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(index) }}
                  disabled={disabled}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    color: 'var(--nn-ink-3)',
                    fontSize: '18px',
                    padding: '0 4px',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remove file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
          <p style={{ fontSize: 'var(--nn-fs-xs)', color: 'var(--nn-ink-3)', textAlign: 'right', margin: 0 }}>
            Referral file selected
          </p>
        </div>
      )}
    </div>
  )
}
