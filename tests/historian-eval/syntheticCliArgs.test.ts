import { describe, it, expect } from 'vitest'
import {
  parseSyntheticDriverArgs,
  assertBaseUrlAllowed,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TURNS,
  HARD_MAX_TURNS,
} from '@/lib/historian/synthetic/cliArgs'

describe('parseSyntheticDriverArgs', () => {
  it('applies defaults for --persona', () => {
    const opts = parseSyntheticDriverArgs(['--persona', 'acute-stroke'])
    expect(opts).toEqual({
      persona: 'acute-stroke',
      allPersonas: false,
      baseUrl: DEFAULT_BASE_URL,
      maxTurns: DEFAULT_MAX_TURNS,
      iKnowThisIsNotLocalhost: false,
      verbose: false,
      help: false,
    })
  })

  it('parses --all-personas', () => {
    const opts = parseSyntheticDriverArgs(['--all-personas'])
    expect(opts.allPersonas).toBe(true)
    expect(opts.persona).toBeNull()
  })

  it('parses --base-url, --max-turns, --verbose, --i-know-this-is-not-localhost together', () => {
    const opts = parseSyntheticDriverArgs([
      '--persona',
      'first-seizure',
      '--base-url',
      'https://staging.example.com',
      '--max-turns',
      '10',
      '--verbose',
      '--i-know-this-is-not-localhost',
    ])
    expect(opts.baseUrl).toBe('https://staging.example.com')
    expect(opts.maxTurns).toBe(10)
    expect(opts.verbose).toBe(true)
    expect(opts.iKnowThisIsNotLocalhost).toBe(true)
  })

  it('--help short-circuits validation (neither --persona nor --all-personas required)', () => {
    const opts = parseSyntheticDriverArgs(['--help'])
    expect(opts.help).toBe(true)
    const opts2 = parseSyntheticDriverArgs(['-h'])
    expect(opts2.help).toBe(true)
  })

  it('throws when neither --persona nor --all-personas is given', () => {
    expect(() => parseSyntheticDriverArgs([])).toThrow(/exactly one of/)
  })

  it('throws when both --persona and --all-personas are given', () => {
    expect(() => parseSyntheticDriverArgs(['--persona', 'x', '--all-personas'])).toThrow(/exactly one of/)
  })

  it('throws on --max-turns above the hard cap of 25', () => {
    expect(() => parseSyntheticDriverArgs(['--all-personas', '--max-turns', '26'])).toThrow(
      new RegExp(`cannot exceed ${HARD_MAX_TURNS}`),
    )
  })

  it('throws on a non-positive or non-integer --max-turns', () => {
    expect(() => parseSyntheticDriverArgs(['--all-personas', '--max-turns', '0'])).toThrow(/positive integer/)
    expect(() => parseSyntheticDriverArgs(['--all-personas', '--max-turns', 'abc'])).toThrow(/positive integer/)
  })

  it('throws on an unknown flag', () => {
    expect(() => parseSyntheticDriverArgs(['--bogus'])).toThrow(/Unknown historian-synthetic-run option/)
  })

  it('throws when a value-taking flag is missing its value', () => {
    expect(() => parseSyntheticDriverArgs(['--persona'])).toThrow(/requires a value/)
    expect(() => parseSyntheticDriverArgs(['--base-url', '--verbose'])).toThrow(/requires a value/)
  })
})

describe('assertBaseUrlAllowed', () => {
  it('allows localhost and 127.0.0.1 without the override flag', () => {
    expect(() => assertBaseUrlAllowed('http://localhost:3111', false)).not.toThrow()
    expect(() => assertBaseUrlAllowed('http://127.0.0.1:3111', false)).not.toThrow()
  })

  it('allows the IPv6 loopback literal (URL.hostname returns it bracketed as "[::1]")', () => {
    // Confirms new URL(...).hostname actually returns the bracketed form —
    // asserting on the real URL API's behavior, not just feeding a literal
    // string, so this test would have caught the original bare-'::1' bug.
    expect(new URL('http://[::1]:3111').hostname).toBe('[::1]')
    expect(() => assertBaseUrlAllowed('http://[::1]:3111', false)).not.toThrow()
  })

  it('rejects a non-localhost URL without the override flag', () => {
    expect(() => assertBaseUrlAllowed('https://staging.neuroplans.app', false)).toThrow(/Refusing to run/)
  })

  it('allows a non-localhost URL when the override flag is set', () => {
    expect(() => assertBaseUrlAllowed('https://staging.neuroplans.app', true)).not.toThrow()
  })

  it('rejects an unparseable URL', () => {
    expect(() => assertBaseUrlAllowed('not a url', false)).toThrow(/not a valid URL/)
  })
})
