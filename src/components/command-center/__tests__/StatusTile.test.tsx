import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import StatusTile from '../StatusTile'

/**
 * Provenance contract (audit 2026-08-04): a clinical count on the Bridge must
 * never be presentable as live when it is a placeholder. The marker is the
 * only thing distinguishing "2 urgent wearable alerts" (real) from the
 * hardcoded fallback left behind by a failed query.
 */
describe('StatusTile provenance marker', () => {
  const base = {
    label: 'Wearable Alerts',
    total: 2,
    sublabel: '2 urgent',
    color: '#0EA5E9',
  }

  it('marks placeholder numbers as sample data', () => {
    const html = renderToStaticMarkup(<StatusTile {...base} isDemo />)
    expect(html).toContain('Sample data')
    expect(html).toContain('Sample data — not a live query result')
  })

  it('shows no marker on a live query result', () => {
    const html = renderToStaticMarkup(<StatusTile {...base} isDemo={false} />)
    expect(html).not.toContain('Sample data')
  })

  it('still renders the count and sublabel in both states', () => {
    for (const isDemo of [true, false]) {
      const html = renderToStaticMarkup(<StatusTile {...base} isDemo={isDemo} />)
      expect(html).toContain('2 urgent')
      expect(html).toContain('Wearable Alerts')
    }
  })
})
