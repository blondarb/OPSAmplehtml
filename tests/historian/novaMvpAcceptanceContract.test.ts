import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(__dirname, '..', '..', 'scripts/nova-historian-mvp-acceptance.ts'),
  'utf8',
)
const relaySource = readFileSync(
  join(__dirname, '..', '..', 'services/nova-sonic-relay/src/server.ts'),
  'utf8',
)

describe('Nova Historian MVP synthetic acceptance contract', () => {
  it('requires one explicit live mode and never accepts supplied speech or PCM', () => {
    expect(source).toContain("process.argv.includes('--live')")
    expect(source).toContain("['--live-rollover-emergency', 'rollover-emergency']")
    expect(source).toContain("['--live-active-scale', 'active-scale']")
    expect(source).toContain("['--live-max-replay', 'max-replay']")
    expect(source).toContain("['--live-endurance-60', 'endurance-60']")
    expect(source).toContain("'/usr/bin/say'")
    expect(source).toContain("'ffmpeg'")
    expect(source).not.toContain("argumentValue('--patient")
    expect(source).not.toContain('readFileSync(process.argv')
  })

  it('uses production prompt/tools and contains no application persistence call', () => {
    expect(source).toContain('buildHistorianSystemPrompt(')
    expect(source).toContain("getHistorianToolsForProvider('nova', 'new_patient')")
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('/api/ai/historian/')
    expect(source).not.toContain('historian_sessions')
  })

  it('keeps the assistant-boundary scheduler process-local and test-only', () => {
    expect(source).toContain('boundaryExchanges: [20, 46]')
    expect(source).toContain("process.env.NODE_ENV = 'test'")
    expect(source).toContain('NOVA_CONTINUATION_TEST_BOUNDARY_EXCHANGES')
    expect(relaySource).toContain('continuationTestBoundaryExchanges()')
    expect(relaySource).not.toContain("case 'continuationTest")
  })

  it('labels each evidence tier without claiming deployment or persistence', () => {
    expect(source).toContain('PASS live_endurance_controlled_60_exchanges_three_real_nova_segments')
    expect(source).toContain('PASS live_state_injected_rollover_emergency_buffered_once')
    expect(source).toContain('PASS live_active_scale_hit6_item_0_checkpointed')
    expect(source).toContain('PASS live_max_replay_state_injected_190000_bytes_45000_per_message')
    expect(source).toContain('not_persistence_not_deployed')
    expect(source).toContain('no_database_write_no_scale_persistence')
    expect(source).toContain('not_persistence_not_alert_delivery')
  })

  it('binds the production 45/60 guard and conservative continuation ledger', () => {
    expect(source).toContain('new HistorianRuntimeGuard()')
    expect(source).toContain("decision.requestFinalization === 'hard_stop'")
    expect(source).toContain('conservativeHistorianContinuationCoverage()')
    expect(source).toContain("entry.reason !== 'unverified_after_rollover'")
  })
})
