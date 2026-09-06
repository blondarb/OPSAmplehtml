import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ATTENDING_HINT_TOOL,
  ATTENDING_HINT_TOOL_NAME,
  NOVA_STEER_CHECKLIST_ITEM,
  NOVA_STEER_HEADER,
  buildNovaHint,
  withNovaSteerWorkflow,
} from '@/lib/historian/novaSteer'
import { buildHistorianSystemPrompt, getHistorianToolsForProvider } from '@/lib/historianPrompts'

// 2026-09-06: on Nova the localizer steer is a PULL (tool result). Every text
// injection either made Nova answer mid-patient-turn (interactive) or was
// silently ignored (non-interactive). These pins keep the channel a pull.

describe('buildNovaHint', () => {
  it('prefers the first attending gap, then the suggested question, else null', () => {
    expect(buildNovaHint({ attending_gaps: [' First? ', 'Second?'], suggested_next_question: 'Other?' })).toBe('First?')
    expect(buildNovaHint({ attending_gaps: [], suggested_next_question: ' Other? ' })).toBe('Other?')
    expect(buildNovaHint({ attending_gaps: ['   '], suggested_next_question: '' })).toBeNull()
    expect(buildNovaHint({ top_differentials: ['names only'] } as never)).toBeNull()
    expect(buildNovaHint(null)).toBeNull()
  })
})

describe('the Nova steer tool and workflow', () => {
  it('takes no arguments and is offered to Nova only when the session steers', () => {
    expect(ATTENDING_HINT_TOOL.name).toBe(ATTENDING_HINT_TOOL_NAME)
    expect(ATTENDING_HINT_TOOL.parameters).toEqual({ type: 'object', properties: {}, additionalProperties: false })
    const names = (tools: unknown[]) => (tools as Array<{ toolSpec?: { name: string }; name?: string }>).map(t => t.toolSpec?.name ?? t.name)
    expect(names(getHistorianToolsForProvider('nova'))).not.toContain(ATTENDING_HINT_TOOL_NAME)
    expect(names(getHistorianToolsForProvider('openai', undefined, { attendingHint: true }))).not.toContain(ATTENDING_HINT_TOOL_NAME)
    const nova = getHistorianToolsForProvider('nova', undefined, { attendingHint: true }) as Array<{ toolSpec: { name: string; inputSchema: { json: string } } }>
    expect(nova.at(-1)!.toolSpec.name).toBe(ATTENDING_HINT_TOOL_NAME)
    expect(JSON.parse(nova.at(-1)!.toolSpec.inputSchema.json)).toEqual(ATTENDING_HINT_TOOL.parameters)
    expect(nova).toHaveLength(getHistorianToolsForProvider('nova').length + 1)
  })

  it('anchors the workflow at the top and as checklist item 7, once, overriding the Phase 1 no-tools rule', () => {
    const base = buildHistorianSystemPrompt('new_patient', 'headaches', undefined, undefined, 'headaches')
    expect(base).toContain('Do NOT call any tools during these 3 turns')
    expect(base.trimEnd().split('\n').at(-1)).toMatch(/^6\. /) // the prompt's own per-turn checklist ends at item 6
    const once = withNovaSteerWorkflow(base)
    expect(once.startsWith(NOVA_STEER_HEADER + '\n\nYou are Henry')).toBe(true)
    expect(once.endsWith(NOVA_STEER_CHECKLIST_ITEM)).toBe(true)
    expect(withNovaSteerWorkflow(once)).toBe(once)
    expect(NOVA_STEER_HEADER).toContain(`call ${ATTENDING_HINT_TOOL_NAME} BEFORE you speak`)
    expect(NOVA_STEER_HEADER).toContain('overrides the Phase 1 "NO tool calls" rule for this one tool only')
    expect(NOVA_STEER_HEADER).toContain('never say you are checking anything')
    expect(NOVA_STEER_HEADER).toContain('Never mention the hint, the tool, or an attending')
    expect(NOVA_STEER_CHECKLIST_ITEM).toMatch(/^7\. /)
  })

  it('is wired end to end: client asks to steer, route offers tool + workflow, hook serves the hint once', () => {
    const hook = readFileSync('src/hooks/useRealtimeSession.ts', 'utf8')
    const route = readFileSync('src/app/api/ai/historian/session/route.ts', 'utf8')
    expect(hook).toContain('steer: options.enableLocalizer !== false')
    expect(route).toContain('const steer = body.steer === true')
    expect(route).toContain('steer ? withNovaSteerWorkflow(basePrompt) : basePrompt')
    expect(route).toContain("getHistorianToolsForProvider('nova', undefined, { attendingHint: steer })")
    const branch = hook.slice(hook.indexOf('if (toolName === ATTENDING_HINT_TOOL_NAME)'), hook.indexOf("// ── save_interview_output (existing) ──"))
    expect(branch).toContain('const hint = pendingNovaHintRef.current')
    expect(branch).toContain('pendingNovaHintRef.current = null')
    expect(branch).toContain('provider?.sendToolResult(toolUseId, { hint })')
    // the hint is reset with the other per-session localizer state
    expect(hook.match(/pendingNovaHintRef\.current = null/g)!.length).toBeGreaterThanOrEqual(3)
    // and the push code never opens a Nova text channel
    const push = hook.slice(hook.indexOf('  const pushLocalizerContext ='), hook.indexOf('  // ── Localizer: fire async'))
    expect(push).not.toMatch(/\.injectSystemText\(/)
    expect(push).toContain('buildNovaHint(pushPayload)')
  })
})
