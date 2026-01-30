import { Suspense } from 'react'
import NeurologicHistorian from '@/components/NeurologicHistorian'

export const dynamic = 'force-dynamic'

export default function HistorianPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
      }}>
        Loading...
      </div>
    }>
      <NeurologicHistorian />
    </Suspense>
  )
}
