// Shared utilities for wearable track components

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Convert UTC timestamp to local date string (YYYY-MM-DD) for matching against daily summary dates
export function toLocalDate(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const darkTooltipStyle = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' },
  labelStyle: { color: '#94a3b8' },
}

export function severityLabel(pct: number): { label: string; color: string } {
  if (pct < 10) return { label: 'Minimal', color: '#22C55E' }
  if (pct < 25) return { label: 'Mild', color: '#EAB308' }
  if (pct < 50) return { label: 'Moderate', color: '#F97316' }
  return { label: 'Significant', color: '#EF4444' }
}

export function fluencyScoreLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'Strong', color: '#22C55E' }
  if (score >= 50) return { label: 'Average', color: '#EAB308' }
  if (score >= 30) return { label: 'Below Average', color: '#F97316' }
  return { label: 'Low', color: '#EF4444' }
}

export function tappingScoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: '#22C55E' }
  if (score >= 60) return { label: 'Good', color: '#3B82F6' }
  if (score >= 40) return { label: 'Fair', color: '#EAB308' }
  if (score >= 20) return { label: 'Below Average', color: '#F97316' }
  return { label: 'Poor', color: '#EF4444' }
}

// Spiral score is 0-1 (fractional), maps to clinical interpretation
export function spiralScoreLabel(score: number): { label: string; color: string } {
  const pct = score * 100
  if (pct >= 80) return { label: 'Normal', color: '#22C55E' }
  if (pct >= 60) return { label: 'Mild', color: '#3B82F6' }
  if (pct >= 40) return { label: 'Moderate', color: '#EAB308' }
  if (pct >= 20) return { label: 'Significant', color: '#F97316' }
  return { label: 'Severe', color: '#EF4444' }
}

// Gait score is 0-1 (fractional), maps to clinical interpretation
export function gaitScoreLabel(score: number): { label: string; color: string } {
  const pct = score * 100
  if (pct >= 80) return { label: 'Normal', color: '#22C55E' }
  if (pct >= 60) return { label: 'Mild Impairment', color: '#3B82F6' }
  if (pct >= 40) return { label: 'Moderate Impairment', color: '#EAB308' }
  if (pct >= 20) return { label: 'Significant Impairment', color: '#F97316' }
  return { label: 'Severe Impairment', color: '#EF4444' }
}
