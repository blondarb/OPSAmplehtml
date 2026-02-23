'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import StatCard from './StatCard'
import EscalationTable from './EscalationTable'
import type { AnalyticsData } from '@/lib/follow-up/billingTypes'

interface AnalyticsDashboardProps {
  data: AnalyticsData
}

const TIER_COLORS = ['#DC2626', '#EA580C', '#EAB308', '#16A34A']
const MODE_COLORS = ['#16A34A', '#3B82F6']
const FUNC_COLORS = ['#16A34A', '#EAB308', '#DC2626']

const darkTooltipStyle = {
  contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.8rem' },
  labelStyle: { color: '#94a3b8' },
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '12px',
      padding: '20px',
      flex: '1 1 380px',
      minWidth: '320px',
    }}>
      <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 16px' }}>{title}</h3>
      {children}
    </div>
  )
}

export default function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  const { summary, volumeByPeriod, completionTrend, escalationDistribution, medicationAdherence, functionalStatus, modeDistribution, recentEscalations } = data

  const escalationPieData = [
    { name: 'Urgent', value: escalationDistribution.urgent },
    { name: 'Same Day', value: escalationDistribution.same_day },
    { name: 'Next Visit', value: escalationDistribution.next_visit },
    { name: 'Informational', value: escalationDistribution.informational },
  ].filter((d) => d.value > 0)

  const medAdherenceData = [
    { name: 'Filled', rate: medicationAdherence.filledRate },
    { name: 'Taking', rate: medicationAdherence.takingRate },
    { name: 'Side Effects', rate: medicationAdherence.sideEffectRate },
  ]

  const funcData = [
    { name: 'Better', count: functionalStatus.better },
    { name: 'Same', count: functionalStatus.same },
    { name: 'Worse', count: functionalStatus.worse },
  ]

  const modePieData = [
    { name: 'SMS', value: modeDistribution.sms },
    { name: 'Voice', value: modeDistribution.voice },
  ].filter((d) => d.value > 0)

  const avgMinutes = Math.floor(summary.avgDuration / 60)
  const avgSeconds = summary.avgDuration % 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Summary Stats */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <StatCard label="Total Calls" value={summary.totalCalls} color="#16A34A" />
        <StatCard label="Completion Rate" value={`${summary.completionRate}%`} color="#3B82F6" />
        <StatCard label="Avg Duration" value={`${avgMinutes}m ${avgSeconds}s`} color="#F59E0B" />
        <StatCard label="Est. Revenue" value={`$${summary.estimatedRevenue.toLocaleString()}`} color="#8B5CF6" />
      </div>

      {/* Operational Charts */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <ChartCard title="Follow-Up Volume">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={volumeByPeriod}>
              <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...darkTooltipStyle} />
              <Bar dataKey="count" fill="#16A34A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Completion Rate Trend">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={completionTrend}>
              <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip {...darkTooltipStyle} />
              <Line type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Clinical Charts */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <ChartCard title="Escalation Distribution">
          {escalationPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={escalationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                  {escalationPieData.map((_, i) => (
                    <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...darkTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No escalations
            </div>
          )}
        </ChartCard>

        <ChartCard title="Medication Adherence">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={medAdherenceData} layout="vertical">
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={80} />
              <Tooltip {...darkTooltipStyle} />
              <Bar dataKey="rate" fill="#0D9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Secondary Charts */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <ChartCard title="Functional Status">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={funcData} layout="vertical">
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} />
              <Tooltip {...darkTooltipStyle} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {funcData.map((_, i) => (
                  <Cell key={i} fill={FUNC_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Mode Distribution">
          {modePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={modePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={(e) => `${e.name}: ${e.value}`}>
                  {modePieData.map((_, i) => (
                    <Cell key={i} fill={MODE_COLORS[i % MODE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...darkTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              No sessions yet
            </div>
          )}
        </ChartCard>
      </div>

      {/* Recent Escalations Table */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '20px',
      }}>
        <h3 style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 16px' }}>
          Recent Escalations
        </h3>
        <EscalationTable escalations={recentEscalations} />
      </div>
    </div>
  )
}
