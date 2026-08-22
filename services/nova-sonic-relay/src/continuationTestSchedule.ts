/**
 * Local acceptance-only assistant-boundary schedule.
 *
 * Production continuation remains time-driven. This parser is deliberately
 * disabled unless NODE_ENV=test, and the resulting schedule is consumed only
 * inside the relay process; it adds no browser/WebSocket control surface.
 */
export function continuationTestBoundaryExchanges(
  nodeEnv = process.env.NODE_ENV,
  raw = process.env.NOVA_CONTINUATION_TEST_BOUNDARY_EXCHANGES,
): number[] {
  if (nodeEnv !== 'test' || !raw?.trim()) return []
  const values = raw.split(',').map((part) => Number(part.trim()))
  if (
    values.some((value) => !Number.isInteger(value) || value < 1) ||
    new Set(values).size !== values.length ||
    values.some((value, index) => index > 0 && value <= values[index - 1])
  ) {
    throw new Error('NOVA_CONTINUATION_TEST_BOUNDARY_EXCHANGES must be strictly increasing positive integers')
  }
  return values
}

export function continuationTestBoundaryAfterTool(
  nodeEnv = process.env.NODE_ENV,
  raw = process.env.NOVA_CONTINUATION_TEST_BOUNDARY_AFTER_TOOL,
): 'scale_step' | null {
  if (nodeEnv !== 'test' || !raw?.trim()) return null
  if (raw.trim() !== 'scale_step') {
    throw new Error('NOVA_CONTINUATION_TEST_BOUNDARY_AFTER_TOOL only supports scale_step')
  }
  return 'scale_step'
}

/** Per-WebSocket deterministic tracker; it contains no timers or I/O. */
export class ContinuationTestBoundarySchedule {
  private assistantExchangeCount = 0
  private nextExchangeIndex = 0
  private toolBoundaryArmed = false
  private toolBoundaryConsumed = false

  constructor(
    private readonly exchanges: readonly number[],
    private readonly afterTool: 'scale_step' | null,
  ) {}

  enabled(): boolean {
    return this.exchanges.length > 0 || this.afterTool !== null
  }

  observeTool(toolName: string): void {
    if (
      toolName === this.afterTool &&
      !this.toolBoundaryConsumed
    ) {
      this.toolBoundaryConsumed = true
      this.toolBoundaryArmed = true
    }
  }

  observeAssistantBoundary(): boolean {
    this.assistantExchangeCount += 1
    const exchangeDue = this.exchanges[this.nextExchangeIndex] === this.assistantExchangeCount
    if (exchangeDue) this.nextExchangeIndex += 1
    const toolDue = this.toolBoundaryArmed
    this.toolBoundaryArmed = false
    return exchangeDue || toolDue
  }
}
