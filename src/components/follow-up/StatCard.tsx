'use client'

interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string
  color?: string
}

export default function StatCard({ label, value, subtitle, color }: StatCardProps) {
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
      flex: '1 1 180px',
      minWidth: '160px',
    }}>
      <div style={{
        fontSize: '2rem',
        fontWeight: 700,
        color: color || '#fff',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.85rem',
        color: '#94a3b8',
        marginTop: '6px',
      }}>
        {label}
      </div>
      {subtitle && (
        <div style={{
          fontSize: '0.75rem',
          color: '#64748b',
          marginTop: '4px',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}
