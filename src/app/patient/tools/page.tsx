import PatientToolsPanel from '@/components/PatientToolsPanel'

export const dynamic = 'force-dynamic'

export default function PatientToolsPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
        padding: '24px 16px',
      }}
    >
      {/* Demo context banner */}
      <div
        style={{
          maxWidth: '480px',
          margin: '0 auto 20px',
          padding: '10px 14px',
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '0.9rem' }}>🧪</span>
        <span style={{ color: '#A78BFA', fontSize: '0.75rem' }}>
          Pre-Visit Assessment — Mark symptoms and complete motor tests before your appointment
        </span>
      </div>

      <PatientToolsPanel />
    </div>
  )
}
