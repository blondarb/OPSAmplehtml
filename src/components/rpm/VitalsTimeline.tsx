'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea,
} from 'recharts'
import type { VitalsReading } from '@/lib/rpm/types'

interface Props {
  readings: VitalsReading[]
}

type VitalTab = 'blood_pressure' | 'weight' | 'spo2' | 'temperature' | 'heart_rate'

const TABS: { key: VitalTab; label: string }[] = [
  { key: 'blood_pressure', label: 'Blood Pressure' },
  { key: 'weight', label: 'Weight' },
  { key: 'spo2', label: 'SpO2' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'heart_rate', label: 'Heart Rate' },
]

const darkTooltipStyle = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' },
  labelStyle: { color: '#94a3b8' },
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getBPData(readings: VitalsReading[]) {
  return readings
    .filter(r => r.reading_type === 'blood_pressure')
    .map(r => ({
      time: formatTime(r.reading_time),
      systolic: r.value_json.systolic,
      diastolic: r.value_json.diastolic,
      raw: r.reading_time,
    }))
    .sort((a, b) => new Date(a.raw).getTime() - new Date(b.raw).getTime())
}

function getSimpleData(readings: VitalsReading[], type: string) {
  return readings
    .filter(r => r.reading_type === type)
    .map(r => ({
      time: formatTime(r.reading_time),
      value: r.value_json.value,
      unit: r.value_json.unit,
      raw: r.reading_time,
    }))
    .sort((a, b) => new Date(a.raw).getTime() - new Date(b.raw).getTime())
}

export default function VitalsTimeline({ readings }: Props) {
  const [activeTab, setActiveTab] = useState<VitalTab>('blood_pressure')

  const tabCounts = TABS.map(t => ({
    ...t,
    count: readings.filter(r => r.reading_type === t.key).length,
  }))

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: '0 0 12px' }}>Vitals Timeline</h3>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {tabCounts.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: activeTab === tab.key ? '#0D9488' : '#0f172a',
              color: activeTab === tab.key ? '#ffffff' : '#94a3b8',
            }}
          >
            {tab.label} {tab.count > 0 && <span style={{ opacity: 0.7 }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      <div style={{ height: '220px' }}>
        {activeTab === 'blood_pressure' ? (
          <BPChart data={getBPData(readings)} />
        ) : (
          <SimpleChart data={getSimpleData(readings, activeTab)} type={activeTab} />
        )}
      </div>
    </div>
  )
}

function BPChart({ data }: { data: ReturnType<typeof getBPData> }) {
  if (data.length === 0) return <EmptyState label="No blood pressure readings" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <YAxis domain={[40, 200]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <Tooltip {...darkTooltipStyle} />
        <ReferenceArea y1={90} y2={120} fill="#065F46" fillOpacity={0.2} />
        <ReferenceArea y1={140} y2={200} fill="#7F1D1D" fillOpacity={0.15} />
        <Line type="monotone" dataKey="systolic" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: '#EF4444' }} name="Systolic" />
        <Line type="monotone" dataKey="diastolic" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: '#3B82F6' }} name="Diastolic" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SimpleChart({ data, type }: { data: ReturnType<typeof getSimpleData>; type: string }) {
  if (data.length === 0) return <EmptyState label={`No ${type.replace('_', ' ')} readings`} />
  const colors: Record<string, string> = {
    weight: '#8B5CF6', spo2: '#3B82F6', temperature: '#F59E0B', heart_rate: '#EF4444',
  }
  const ranges: Record<string, { low: number; high: number }> = {
    spo2: { low: 90, high: 100 },
    temperature: { low: 36.1, high: 37.2 },
    heart_rate: { low: 60, high: 100 },
  }
  const range = ranges[type]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <Tooltip {...darkTooltipStyle} />
        {range && <ReferenceArea y1={range.low} y2={range.high} fill="#065F46" fillOpacity={0.15} />}
        <Line type="monotone" dataKey="value" stroke={colors[type] || '#0D9488'} strokeWidth={2} dot={{ r: 3 }} name={type.replace('_', ' ')} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px' }}>
      {label}
    </div>
  )
}
