import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(
  resolve(process.cwd(), 'infrastructure/historian-worker/template.yaml'),
  'utf8',
)

describe('Historian evaluation worker infrastructure', () => {
  it('enforces the Lambda SQS maximum-concurrency floor', () => {
    expect(template).toMatch(
      /WorkerMaximumConcurrency:\s+Type: Number\s+Default: 3\s+MinValue: 2\s+MaxValue: 10/,
    )
    expect(template).toContain('ReservedConcurrentExecutions: !Ref WorkerMaximumConcurrency')
    expect(template).toContain('MaximumConcurrency: !Ref WorkerMaximumConcurrency')
    expect(template).toContain('BatchSize: 1')
  })

  it('cleans queues after an initial-create rollback but retains accepted queues', () => {
    expect(template.match(/DeletionPolicy: RetainExceptOnCreate/g)).toHaveLength(2)
    expect(template.match(/UpdateReplacePolicy: Retain/g)).toHaveLength(2)
  })
})
