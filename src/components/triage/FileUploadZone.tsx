'use client'

import { useState, useRef, useCallback } from 'react'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

interface FileUploadZoneProps {
  onFilesChange: (files: File[]) => void
  disabled?: boolean
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

function isValidFileType(file: File): boolean {
  const ext = getFileExtension(file.name)
  return (FILE_CONSTRAINTS.ALLOWED_EXTENSIONS as readonly string[]).includes(ext)
}

export default function FileUploadZone({ onFilesChange, disabled }: FileUploadZoneProps) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const incoming = Array.from(newFiles)
    const validationErrors: string[] = []

    const validFiles = incoming.filter(file => {
      if (!isValidFileType(file)) {
        validationErrors.push(`${file.name}: Unsupported type. Accepted: ${FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}`)
        return false
      }
      if (file.size > FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES) {
        validationErrors.push(`${file.name}: Exceeds ${FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY} limit`)
        return false
      }
      return true
    })

    setErrors(validationErrors)

    setFiles(prev => {
      const combined = [...prev, ...validFiles]
      if (combined.length > FILE_CONSTRAINTS.MAX_BATCH_FILES) {
        setErrors(e => [...e, `Maximum ${FILE_CONSTRAINTS.MAX_BATCH_FILES} files allowed. Some files were not added.`])
        const trimmed = combined.slice(0, FILE_CONSTRAINTS.MAX_BATCH_FILES)
        onFilesChange(trimmed)
        return trimmed
      }
      onFilesChange(combined)
      return combined
    })
  }, [onFilesChange])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const updated = prev.filter((_, i) => i !== index)
      onFilesChange(updated)
      return updated
    })
    setErrors([])
  }, [onFilesChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles, disabled])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }, [disabled])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
      e.target.value = '' // reset so same file can be re-added
    }
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
          border: `2px dashed ${dragOver ? '#0D9488' : '#475569'}`,
          borderRadius: '12px',
          padding: '32px 24px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: dragOver ? 'rgba(13, 148, 136, 0.08)' : disabled ? '#0f172a' : '#1e293b',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={dragOver ? '#0D9488' : '#94a3b8'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p style={{ color: '#e2e8f0', fontWeight: 500, marginBottom: '4px', margin: '0 0 4px 0' }}>
          {dragOver ? 'Drop files here' : 'Drag & drop clinical notes here'}
        </p>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '12px', margin: '0 0 12px 0' }}>
          or click to browse
        </p>
        <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
          PDF, DOCX, TXT &mdash; up to {FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY} each, {FILE_CONSTRAINTS.MAX_BATCH_FILES} files max
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
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
            <p key={i} style={{ color: '#EF4444', fontSize: '0.8rem', marginBottom: '2px', margin: '0 0 2px 0' }}>
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
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
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
                    fontSize: '0.85rem',
                    color: '#e2e8f0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {file.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', flexShrink: 0 }}>
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
                    color: '#94a3b8',
                    fontSize: '18px',
                    padding: '0 4px',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remove file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
          <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right', margin: 0 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  )
}
