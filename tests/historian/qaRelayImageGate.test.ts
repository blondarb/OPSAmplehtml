import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const relayTemplate = read('infrastructure/historian-qa/relay.yaml')
const relayDockerfile = read('services/nova-sonic-relay/Dockerfile')
const inlineGate = relayTemplate.match(
  /# SCAN_COUNT_GATE_START[^\n]*\n([\s\S]*?)# SCAN_COUNT_GATE_END/,
)?.[1]

function runGate(critical: string, high: string) {
  if (!inlineGate) throw new Error('inline scan count gate is missing')
  return spawnSync('/bin/sh', [
    '-c',
    `set -eu\ncritical="$1"\nhigh="$2"\n${inlineGate}`,
    'relay-scan-gate',
    critical,
    high,
  ], {
    encoding: 'utf8',
  })
}

describe('Historian QA relay image gate', () => {
  it('accepts only explicit zero or ECR None counts', () => {
    expect(runGate('0', '0').status).toBe(0)
    expect(runGate('None', 'None').status).toBe(0)
  })

  it.each([
    ['', '0'],
    ['unexpected', '0'],
    ['0', ''],
    ['0', 'unexpected'],
    ['1', '0'],
    ['0', '1'],
    ['00', '0'],
  ])('fails closed for CRITICAL=%j HIGH=%j', (critical, high) => {
    const result = runGate(critical, high)
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('FAIL relay image scan')
  })

  it('keeps the tested count decision inline and retries only scan registration', () => {
    expect(relayTemplate).toContain('scan_wait_attempt=$((scan_wait_attempt + 1))')
    expect(relayTemplate).toContain('if test "$scan_wait_attempt" -ge 24')
    expect(relayTemplate).toContain(
      'SCAN_COUNT_GATE_START — stack-controlled; the source archive cannot replace this gate.',
    )
    expect(relayTemplate).not.toContain('relay-scan-gate.sh')
  })

  it('pins the official Node image and patched Alpine OpenSSL packages in both stages', () => {
    expect(relayDockerfile.match(/node:22-alpine3\.23@sha256:46825fbb/g)).toHaveLength(2)
    expect(relayDockerfile.match(/openssl=3\.5\.8-r0/g)).toHaveLength(2)
    expect(relayDockerfile.match(/libssl3=3\.5\.8-r0/g)).toHaveLength(2)
    expect(relayDockerfile.match(/libcrypto3=3\.5\.8-r0/g)).toHaveLength(2)
    expect(relayDockerfile).toContain('USER node')
  })
})
