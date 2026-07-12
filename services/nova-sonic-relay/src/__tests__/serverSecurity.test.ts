import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverSource = readFileSync(resolve(process.cwd(), 'src/server.ts'), 'utf8')
const upgradeSource = readFileSync(
  resolve(process.cwd(), 'src/relayUpgrade.ts'),
  'utf8',
)

describe('Nova relay diagnostic logging boundary', () => {
  it('never interpolates transcript or tool payload content into trace logs', () => {
    expect(serverSource).not.toContain('JSON.stringify(content')
    expect(serverSource).not.toContain('String(content)')
    expect(serverSource).not.toContain('String(msg.output)')
    expect(serverSource).not.toMatch(/TRACE\([^\n]*msg\.text/)
  })

  it('does not log an unvalidated browser message type', () => {
    expect(serverSource).not.toContain('TRACE(`<- ${msg.t}`)')
  })

  it('does not log raw service errors or their potentially sensitive messages', () => {
    expect(serverSource).not.toContain(
      "console.error('[nova-session] stream error:', message, err)",
    )
  })

  it('keeps transport error objects out of raw and accepted socket logs', () => {
    expect(upgradeSource).not.toContain('logTransportError(error')
    expect(upgradeSource).not.toContain('logTransportError(reason')
    expect(upgradeSource).not.toContain('console.error(error')
    expect(upgradeSource).not.toContain('console.warn(error')
    expect(upgradeSource).toContain(
      "'[nova-relay] accepted WebSocket transport error'",
    )
  })
})
