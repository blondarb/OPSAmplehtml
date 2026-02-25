import { Mail, Pill, Image, Watch, Phone, Brain, Activity, Inbox } from 'lucide-react'
import type { PendingItems } from '@/lib/command-center/types'

interface PendingItemBadgesProps {
  items: PendingItems
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CATEGORY_CONFIG: { key: keyof PendingItems; icon: React.ComponentType<any>; label: string }[] = [
  { key: 'messages', icon: Mail, label: 'messages' },
  { key: 'refills', icon: Pill, label: 'refills' },
  { key: 'results', icon: Image, label: 'results' },
  { key: 'wearables', icon: Watch, label: 'wearables' },
  { key: 'followups', icon: Phone, label: 'follow-ups' },
  { key: 'triage', icon: Brain, label: 'triage' },
  { key: 'scales', icon: Activity, label: 'scales' },
  { key: 'ehr', icon: Inbox, label: 'ehr' },
]

export default function PendingItemBadges({ items }: PendingItemBadgesProps) {
  const active = CATEGORY_CONFIG.filter(({ key }) => items[key] > 0)

  if (active.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
      }}
    >
      {active.map(({ key, icon: Icon, label }) => (
        <div
          key={key}
          title={`${items[key]} ${label}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            color: '#64748b',
            fontSize: '0.75rem',
            lineHeight: 1,
          }}
        >
          <Icon size={14} color="#64748b" />
          <span>{items[key]}</span>
        </div>
      ))}
    </div>
  )
}
