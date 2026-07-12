import { describe, it, expect } from 'vitest'
import {
  NovaSonicSession,
  parseGenerationStage,
  shouldForwardText,
} from '../novaSonicSession.js'

// Event shapes below are verbatim (minus ids) from a live Nova Sonic stream
// captured 2026-07-11 via RELAY_TRACE_RAW=1 + scripts/frame-probe.mjs — the
// duplicate-transcript repro: every ASSISTANT turn arrives as SPECULATIVE
// text (with the audio) then again byte-identical as FINAL (at END_TURN).

function contentStart(contentId: string, role: string, stage: string) {
  return {
    event: {
      contentStart: {
        additionalModelFields: `{"generationStage":"${stage}"}`,
        contentId,
        role,
        type: 'TEXT',
      },
    },
  }
}

function textOutput(contentId: string, role: string, content: string) {
  return { event: { textOutput: { contentId, role, content } } }
}

function contentEnd(contentId: string, stopReason: string) {
  return { event: { contentEnd: { contentId, stopReason, type: 'TEXT' } } }
}

/** Drive a session's private dispatcher directly with fabricated model events. */
function makeHarness() {
  const forwarded: Array<{ role: string; content: string }> = []
  const session = new NovaSonicSession({
    onTextOutput(role, content) {
      forwarded.push({ role, content })
    },
  })
  const dispatch = (e: unknown) =>
    (session as unknown as { handleModelEvent(j: unknown): void }).handleModelEvent(e)
  return { forwarded, dispatch }
}

describe('parseGenerationStage', () => {
  it('parses SPECULATIVE and FINAL from the JSON-string field', () => {
    expect(parseGenerationStage('{"generationStage":"SPECULATIVE"}')).toBe('SPECULATIVE')
    expect(parseGenerationStage('{"generationStage":"FINAL"}')).toBe('FINAL')
  })
  it('returns unknown for missing/malformed/unexpected input', () => {
    expect(parseGenerationStage(undefined)).toBe('')
    expect(parseGenerationStage('not json')).toBe('')
    expect(parseGenerationStage('{}')).toBe('')
    expect(parseGenerationStage('{"generationStage":"SOMETHING_NEW"}')).toBe('')
  })
})

describe('shouldForwardText', () => {
  it('USER: forwards FINAL only (ASR interims dropped)', () => {
    expect(shouldForwardText('USER', 'FINAL')).toBe(true)
    expect(shouldForwardText('USER', 'SPECULATIVE')).toBe(false)
  })
  it('ASSISTANT: forwards SPECULATIVE only (FINAL is the duplicate)', () => {
    expect(shouldForwardText('ASSISTANT', 'SPECULATIVE')).toBe(true)
    expect(shouldForwardText('ASSISTANT', 'FINAL')).toBe(false)
  })
  it('fails open on unknown stage — never silently drops content', () => {
    expect(shouldForwardText('USER', '')).toBe(true)
    expect(shouldForwardText('ASSISTANT', '')).toBe(true)
  })
})

describe('NovaSonicSession text-stage filtering (live-captured pattern)', () => {
  it('forwards an assistant turn exactly ONCE (SPECULATIVE kept, FINAL dropped)', () => {
    const { forwarded, dispatch } = makeHarness()
    const reply =
      'Hello, Doctor Chen. Thank you for calling in. To get started, is the patient currently able to speak clearly?'

    // SPECULATIVE copy — streams with the audio
    dispatch(contentStart('c-spec', 'ASSISTANT', 'SPECULATIVE'))
    dispatch(textOutput('c-spec', 'ASSISTANT', reply))
    dispatch(contentEnd('c-spec', 'PARTIAL_TURN'))
    // FINAL copy — identical text, arrives at END_TURN (the duplicate)
    dispatch(contentStart('c-final', 'ASSISTANT', 'FINAL'))
    dispatch(textOutput('c-final', 'ASSISTANT', reply))
    dispatch(contentEnd('c-final', 'END_TURN'))

    expect(forwarded).toEqual([{ role: 'ASSISTANT', content: reply }])
  })

  it('forwards each USER ASR segment once (all FINAL)', () => {
    const { forwarded, dispatch } = makeHarness()
    const segments = [
      'hi this is doctor chen calling from marion general',
      'emergency department i have a sixty seven year old man with sudden',
      'right sided weakness and slurred speech that started about thirty minutes ago',
    ]
    segments.forEach((text, i) => {
      dispatch(contentStart(`u-${i}`, 'USER', 'FINAL'))
      dispatch(textOutput(`u-${i}`, 'USER', text))
      dispatch(contentEnd(`u-${i}`, 'PARTIAL_TURN'))
    })
    expect(forwarded.map((f) => f.content)).toEqual(segments)
  })

  it('drops USER SPECULATIVE interims (interim==final double-emission guard)', () => {
    const { forwarded, dispatch } = makeHarness()
    dispatch(contentStart('u-spec', 'USER', 'SPECULATIVE'))
    dispatch(textOutput('u-spec', 'USER', 'his last known well time'))
    dispatch(contentEnd('u-spec', 'PARTIAL_TURN'))
    dispatch(contentStart('u-final', 'USER', 'FINAL'))
    dispatch(textOutput('u-final', 'USER', 'his last known well time was around seven pm'))
    dispatch(contentEnd('u-final', 'PARTIAL_TURN'))
    expect(forwarded).toEqual([
      { role: 'USER', content: 'his last known well time was around seven pm' },
    ])
  })

  it('fails open when no contentStart was seen for the contentId', () => {
    const { forwarded, dispatch } = makeHarness()
    dispatch(textOutput('orphan', 'ASSISTANT', 'text with no contentStart'))
    expect(forwarded).toEqual([{ role: 'ASSISTANT', content: 'text with no contentStart' }])
  })

  it('still routes the interrupted/barge-in signal, never as a transcript', () => {
    let bargeIns = 0
    const forwarded: string[] = []
    const session = new NovaSonicSession({
      onTextOutput: (_r, c) => { forwarded.push(c) },
      onBargeIn: () => { bargeIns++ },
    })
    const dispatch = (e: unknown) =>
      (session as unknown as { handleModelEvent(j: unknown): void }).handleModelEvent(e)
    dispatch(contentStart('c-int', 'ASSISTANT', 'FINAL'))
    dispatch(textOutput('c-int', 'ASSISTANT', '{ "interrupted" : true }'))
    expect(bargeIns).toBe(1)
    expect(forwarded).toEqual([])
  })

  it('cleans up stage tracking on contentEnd (no unbounded growth)', () => {
    const { dispatch } = makeHarness()
    const session = new NovaSonicSession({})
    const d = (e: unknown) =>
      (session as unknown as { handleModelEvent(j: unknown): void }).handleModelEvent(e)
    for (let i = 0; i < 50; i++) {
      d(contentStart(`c-${i}`, 'USER', 'FINAL'))
      d(textOutput(`c-${i}`, 'USER', 'hello'))
      d(contentEnd(`c-${i}`, 'PARTIAL_TURN'))
    }
    const map = (session as unknown as { textStageByContentId: Map<string, string> })
      .textStageByContentId
    expect(map.size).toBe(0)
    void dispatch
  })
})
