'use client'

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceArea, PieChart, Pie, Cell,
} from 'recharts'
import type { GlucoseReading, GlucoseStats } from '@/lib/rpm/types'
import { computeGlucoseStats, TREND_ARROWS } from '@/lib/rpm/types'

interface Props {
  readings: GlucoseReading[]
}

const darkTooltipStyle = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' },
  labelStyle: { color: '#94a3b8' },
}

const ZONE_COLORS = {
  urgentLow: '#DC2626',
  low: '#F59E0B',
  inRange: '#10B981',
  high: '#F59E0B',
  veryHigh: '#DC2626',
}

function formatHour(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function GlucoseDashboard({ readings }: Props) {
  const stats = computeGlucoseStats(readings)
  const latest = readings.length > 0 ? readings[readings.length - 1] : null
  const chartData = readings.map(r => ({
    time: formatHour(r.reading_time),
    value: r.value_mgdl,
    raw: r.reading_time,
  })).sort((a, b) => new Date(a.raw).getTime() - new Date(b.raw).getTime())

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>Glucose Monitor</h3>
        {latest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: glucoseColor(latest.value_mgdl) }}>
              {latest.value_mgdl}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>mg/dL</span>
            <span style={{ fontSize: '18px' }}>{TREND_ARROWS[latest.trend] || '—'}</span>
          </div>
        )}
      </div>

      {readings.length === 0 ? (
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '13px' }}>
          No glucose readings — connect Dexcom CGM
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
          {/* CGM Trace */}
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[40, 400]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip {...darkTooltipStyle} />
                <ReferenceArea y1={70} y2={180} fill="#065F46" fillOpacity={0.15} label={{ value: 'Target', fill: '#6EE7B7', fontSize: 10 }} />
                <ReferenceArea y1={40} y2={54} fill="#7F1D1D" fillOpacity={0.15} />
                <ReferenceArea y1={250} y2={400} fill="#7F1D1D" fillOpacity={0.15} />
                <Line type="monotone" dataKey="value" stroke="#F59E0B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stats Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <TIRDonut stats={stats} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <StatCard label="Avg Glucose" value={`${stats.averageGlucose}`} unit="mg/dL" />
              <StatCard label="GMI (est. A1C)" value={`${stats.gmi}%`} />
              <StatCard label="CV" value={`${stats.cv}%`} good={stats.cv <= 36} />
              <StatCard label="Readings" value={`${stats.readingCount}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TIRDonut({ stats }: { stats: GlucoseStats }) {
  const data = [
    { name: 'Urgent Low (<54)', value: stats.timeUrgentLow, color: ZONE_COLORS.urgentLow },
    { name: 'Low (54-70)', value: stats.timeLow, color: ZONE_COLORS.low },
    { name: 'In Range (70-180)', value: stats.timeInRange, color: ZONE_COLORS.inRange },
    { name: 'High (180-250)', value: stats.timeHigh, color: ZONE_COLORS.high },
    { name: 'Very High (>250)', value: stats.timeVeryHigh, color: ZONE_COLORS.veryHigh },
  ].filter(d => d.value > 0)

  return (
    <div style={{ position: 'relative', height: '100px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={45} strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '11px' }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#10B981' }}>{stats.timeInRange.toFixed(0)}%</div>
        <div style={{ fontSize: '9px', color: '#94a3b8' }}>TIR</div>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, good }: { label: string; value: string; unit?: string; good?: boolean }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: '6px', padding: '8px' }}>
      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: good === false ? '#F59E0B' : '#f1f5f9', marginTop: '2px' }}>
        {value} {unit && <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  )
}

function glucoseColor(value: number): string {
  if (value < 54) return '#DC2626'
  if (value < 70) return '#F59E0B'
  if (value <= 180) return '#10B981'
  if (value <= 250) return '#F59E0B'
  return '#DC2626'
}
