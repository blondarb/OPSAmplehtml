import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import * as demoLoaderModule from '../DemoScenarioLoader'
import {
  beginReferralAttempt,
  invalidateReferralAttempts,
  isCurrentReferralAttempt,
} from '@/lib/triage/referralAttempt'

const fileUploadZoneSource = readFileSync(
  join(process.cwd(), 'src/components/triage/FileUploadZone.tsx'),
  'utf8',
)
const triageInputPanelSource = readFileSync(
  join(process.cwd(), 'src/components/triage/TriageInputPanel.tsx'),
  'utf8',
)
const demoScenarioLoaderSource = readFileSync(
  join(process.cwd(), 'src/components/triage/DemoScenarioLoader.tsx'),
  'utf8',
)
const demoPreviewModalSource = readFileSync(
  join(process.cwd(), 'src/components/triage/DemoPreviewModal.tsx'),
  'utf8',
)

interface TestDemoLoadGate {
  generation: number
  controller: AbortController | null
}

const createDemoFileLoadGate = (
  demoLoaderModule as unknown as {
    createDemoFileLoadGate?: () => TestDemoLoadGate
  }
).createDemoFileLoadGate
const invalidateDemoFileLoad = (
  demoLoaderModule as unknown as {
    invalidateDemoFileLoad?: (gate: TestDemoLoadGate) => void
  }
).invalidateDemoFileLoad
const loadDemoScenarioFiles = (
  demoLoaderModule as unknown as {
    loadDemoScenarioFiles?: (input: {
      scenario: {
        files: ReadonlyArray<{ path: string; filename: string }>
      }
      gate: TestDemoLoadGate
      onBeginLoad: () => void
      fetchImpl: (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>
    }) => Promise<
      | { status: 'success'; files: File[] }
      | { status: 'cancelled' }
      | { status: 'error' }
    >
  }
).loadDemoScenarioFiles

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('single-referral upload surface contract', () => {
  it('does not let the browser select multiple files', () => {
    const fileInput = fileUploadZoneSource.match(
      /<input\b(?=[^>]*\btype="file")[^>]*>/,
    )?.[0]

    expect(fileInput).toBeDefined()
    expect(fileInput).not.toMatch(/\bmultiple(?:\s|=|\/>|>)/)
  })

  it('describes one referral packet instead of a file batch', () => {
    expect(fileUploadZoneSource).not.toContain('files max')
    expect(fileUploadZoneSource).toContain(
      'PDF, DOCX, or TXT &mdash; one referral packet up to {FILE_CONSTRAINTS.MAX_FILE_SIZE_DISPLAY}',
    )
  })

  it('uses singular referral-file labels in the triage panel', () => {
    expect(triageInputPanelSource).not.toContain('Upload File(s)')
    expect(triageInputPanelSource).toContain('Upload Referral File')
  })

  it('uses the production transition for browser and external candidates', () => {
    expect(fileUploadZoneSource).toContain(
      'applyReferralFileSelection(incoming, onFilesChange)',
    )
    expect(fileUploadZoneSource).toMatch(
      /applyReferralFileSelection\(\s*incoming,\s*onExternalFilesChange,?\s*\)/,
    )
    expect(fileUploadZoneSource).toContain('addExternalFiles(externalFiles)')
    expect(fileUploadZoneSource).not.toContain('externalFiles.length')
    expect(fileUploadZoneSource).not.toContain(
      'selectSingleReferralFile(externalFiles)',
    )
  })

  it('does not bypass reconciliation for empty drop or input candidates', () => {
    expect(fileUploadZoneSource).not.toContain(
      'if (e.dataTransfer.files.length > 0)',
    )
    expect(fileUploadZoneSource).not.toContain(
      'if (e.target.files && e.target.files.length > 0)',
    )
    expect(fileUploadZoneSource).toContain('addFiles(e.dataTransfer.files)')
    expect(fileUploadZoneSource).toContain('addFiles(e.target.files ?? [])')
  })

  it('renders the parent-owned file state without child selection state or remount keys', () => {
    expect(fileUploadZoneSource).toContain('files: File[]')
    expect(fileUploadZoneSource).not.toContain(
      'const [files, setFiles] = useState<File[]>([])',
    )
    expect(fileUploadZoneSource).not.toContain('setFiles(')
    expect(triageInputPanelSource).toContain('files={uploadedFiles}')
    expect(triageInputPanelSource).toContain('setUploadedFiles([])')
    expect(triageInputPanelSource).not.toContain('uploadResetVersion')
    expect(triageInputPanelSource).not.toContain('key={uploadResetVersion}')
  })

  it('consumes demo files once so a later browser selection survives tab remounts', () => {
    expect(fileUploadZoneSource).toContain(
      'onExternalFilesConsumed: () => void',
    )
    expect(fileUploadZoneSource).toContain('onExternalFilesConsumed()')
    expect(triageInputPanelSource).toContain(
      'onExternalFilesConsumed={handleExternalFilesConsumed}',
    )
    expect(triageInputPanelSource).toContain(
      'setDemoFiles(undefined)',
    )
    expect(triageInputPanelSource).toContain(
      'The demo click already opened the new-referral boundary synchronously.',
    )
  })

  it('notifies the parent lifecycle for Clear and every deliberate source replacement', () => {
    expect(triageInputPanelSource).toContain(
      "onReferralLifecycle: (event: 'clear' | 'source_replacement') => void",
    )
    expect(triageInputPanelSource).toContain(
      "beginReferralLifecycle('clear')",
    )
    expect(triageInputPanelSource).toContain('commitVisibleIdentityChange(')
    expect(triageInputPanelSource).toContain('handleTextChange')
    expect(triageInputPanelSource).toContain('handleFilesChange')
    expect(triageInputPanelSource).toContain(
      '<SampleNoteLoader onSelect={handleSampleNoteSelection} />',
    )
    expect(triageInputPanelSource).toContain(
      'onFilesChange={handleFilesChange}',
    )
  })

  it('exposes one synchronous local reset used by the external new-referral boundary', () => {
    const resetScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('const clearVisibleReferralInput'),
      triageInputPanelSource.indexOf('function handleReset'),
    )

    expect(triageInputPanelSource).toContain(
      'export interface TriageInputPanelHandle',
    )
    expect(triageInputPanelSource).toContain('useImperativeHandle(')
    expect(triageInputPanelSource).toContain('clearVisibleReferralInput,')
    expect(resetScope).toContain(
      'demoLoaderRef.current?.invalidatePendingLoad()',
    )
    expect(resetScope).toContain("setText('')")
    expect(resetScope).toContain("setAge('')")
    expect(resetScope).toContain("setSex('')")
    expect(resetScope).toContain("setMetadataError('')")
    expect(resetScope).toContain('setUploadedFiles([])')
    expect(resetScope).toContain('setDemoFiles(undefined)')
  })

  it('begins a demo replacement synchronously and reconciles it without rotating the case twice', () => {
    const demoBegin = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleBeginDemoLoad'),
      triageInputPanelSource.indexOf('function handleLoadDemoFiles'),
    )
    const demoHandler = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleLoadDemoFiles'),
      triageInputPanelSource.indexOf('function handleTextChange'),
    )
    const demoReconciliation = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleDemoFilesChange'),
      triageInputPanelSource.indexOf('function handleSampleNoteSelection'),
    )

    expect(demoBegin).toContain("onReferralLifecycle('source_replacement')")
    expect(demoHandler).not.toContain('onReferralLifecycle')
    expect(demoHandler).toContain('setDemoFiles([...files])')
    expect(demoReconciliation).toContain('setUploadedFiles(files)')
    expect(demoReconciliation).not.toContain('onReferralLifecycle(')
    expect(fileUploadZoneSource).toContain(
      'onExternalFilesChange: (files: File[]) => void',
    )
    expect(fileUploadZoneSource).toMatch(
      /applyReferralFileSelection\(\s*incoming,\s*onExternalFilesChange,?\s*\)/,
    )
    expect(triageInputPanelSource).toContain(
      'onExternalFilesChange={handleDemoFilesChange}',
    )
  })

  it('wires demo load intent before fetch and gates every commit on current ownership', () => {
    const loadScope = demoScenarioLoaderSource.slice(
      demoScenarioLoaderSource.indexOf('const handleLoad'),
      demoScenarioLoaderSource.indexOf('const scenarios'),
    )

    expect(demoPreviewModalSource).toContain('onClick={() => onLoad(scenario)}')
    expect(loadScope).toContain('loadDemoScenarioFiles({')
    expect(loadScope).toContain('onBeginLoad')
    expect(loadScope.indexOf('onBeginLoad')).toBeLessThan(
      loadScope.indexOf('onLoadFiles'),
    )
    expect(loadScope).toContain("if (result.status !== 'success') return")
    expect(demoScenarioLoaderSource).toContain('invalidatePendingLoad')
    expect(triageInputPanelSource).toContain(
      'onBeginLoad={handleBeginDemoLoad}',
    )
  })

  it('rotates every actual visible identity change before mutating component state', () => {
    const lifecycleScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function beginReferralLifecycle'),
      triageInputPanelSource.indexOf('function handleSubmit'),
    )
    const modeScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleInputModeChange'),
      triageInputPanelSource.indexOf('function handleSubmit'),
    )
    const clearScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleReset'),
      triageInputPanelSource.indexOf('const charCount'),
    )

    expect(lifecycleScope).toContain(
      'demoLoaderRef.current?.invalidatePendingLoad()',
    )
    expect(lifecycleScope.indexOf('invalidatePendingLoad')).toBeLessThan(
      lifecycleScope.indexOf('onReferralLifecycle(event)'),
    )
    for (const handler of [
      'handleTextChange',
      'handleFilesChange',
      'handleSampleNoteSelection',
      'handleAgeChange',
      'handleSexChange',
    ]) {
      const start = triageInputPanelSource.indexOf(`function ${handler}`)
      expect(start).toBeGreaterThan(-1)
      const scope = triageInputPanelSource.slice(start, start + 420)
      expect(scope).toContain('commitVisibleIdentityChange(')
    }
    expect(modeScope).toContain('shouldRotateReferralInputMode({')
    expect(modeScope.indexOf("beginReferralLifecycle('source_replacement')")).toBeLessThan(
      modeScope.indexOf('setActiveMode(mode)'),
    )
    expect(clearScope.indexOf("beginReferralLifecycle('clear')")).toBeLessThan(
      clearScope.indexOf('clearVisibleReferralInput()'),
    )
    expect(triageInputPanelSource).toContain(
      'onClick={() => handleInputModeChange(\'paste\')}',
    )
    expect(triageInputPanelSource).toContain(
      'onClick={() => handleInputModeChange(\'upload\')}',
    )
    expect(triageInputPanelSource).toContain(
      'onChange={(e) => handleAgeChange(e.target.value)}',
    )
    expect(triageInputPanelSource).toContain(
      'onChange={(e) => handleSexChange(e.target.value)}',
    )
    expect(triageInputPanelSource).not.toContain('handleProviderTypeChange')
    expect(triageInputPanelSource).not.toContain('providerType')
    expect(triageInputPanelSource).toContain(
      'Referring-provider type is unavailable until a reviewed provenance schema can persist and verify its source.',
    )
  })

  it('keeps successful demo reconciliation separate from user identity rotation', () => {
    const beginScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleBeginDemoLoad'),
      triageInputPanelSource.indexOf('function handleLoadDemoFiles'),
    )
    const commitScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleLoadDemoFiles'),
      triageInputPanelSource.indexOf('function handleTextChange'),
    )
    const reconciliationScope = triageInputPanelSource.slice(
      triageInputPanelSource.indexOf('function handleDemoFilesChange'),
      triageInputPanelSource.indexOf('function handleSampleNoteSelection'),
    )

    expect(beginScope).toContain("onReferralLifecycle('source_replacement')")
    expect(commitScope).not.toContain('onReferralLifecycle(')
    expect(commitScope).toContain('setDemoFiles([...files])')
    expect(commitScope).toContain("setActiveMode('upload')")
    expect(reconciliationScope).not.toContain('onReferralLifecycle(')
  })
})

describe('abortable demo referral loads', () => {
  it('invalidates the prior referral synchronously before the first demo fetch', async () => {
    expect(typeof createDemoFileLoadGate).toBe('function')
    expect(typeof loadDemoScenarioFiles).toBe('function')
    if (!createDemoFileLoadGate || !loadDemoScenarioFiles) return

    const active = beginReferralAttempt(
      { sourceIdentity: null, generation: 0, caseNonce: 'before-demo-fetch' },
      'paste:in-flight-before-demo',
    )
    let state = active.state
    const order: string[] = []
    const fetchImpl = vi.fn(async () => {
      order.push('fetch')
      expect(isCurrentReferralAttempt(state, active.token)).toBe(false)
      return new Response('synthetic demo')
    })

    const result = await loadDemoScenarioFiles({
      scenario: {
        files: [{ path: '/demo-a.pdf', filename: 'demo-a.pdf' }],
      },
      gate: createDemoFileLoadGate(),
      onBeginLoad: () => {
        order.push('parent-lifecycle')
        state = invalidateReferralAttempts(state, 'after-demo-click')
      },
      fetchImpl,
    })

    expect(order).toEqual(['parent-lifecycle', 'fetch'])
    expect(result).toMatchObject({ status: 'success' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(
      '/demo-a.pdf',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it.each(['close', 'manual source change', 'Clear', 'unmount'])(
    '%s aborts a pending demo and rejects its late completion',
    async () => {
      expect(typeof createDemoFileLoadGate).toBe('function')
      expect(typeof invalidateDemoFileLoad).toBe('function')
      expect(typeof loadDemoScenarioFiles).toBe('function')
      if (
        !createDemoFileLoadGate ||
        !invalidateDemoFileLoad ||
        !loadDemoScenarioFiles
      ) {
        return
      }
      const gate = createDemoFileLoadGate()
      const pendingResponse = deferred<Response>()
      let signal: AbortSignal | undefined
      const load = loadDemoScenarioFiles({
        scenario: {
          files: [{ path: '/demo-stale.pdf', filename: 'demo-stale.pdf' }],
        },
        gate,
        onBeginLoad: vi.fn(),
        fetchImpl: async (_input, init) => {
          signal = init?.signal ?? undefined
          return pendingResponse.promise
        },
      })

      invalidateDemoFileLoad(gate)
      expect(signal?.aborted).toBe(true)
      pendingResponse.resolve(new Response('late stale demo'))

      await expect(load).resolves.toEqual({ status: 'cancelled' })
    },
  )

  it('lets demo B own the commit when demo A resolves late', async () => {
    expect(typeof createDemoFileLoadGate).toBe('function')
    expect(typeof loadDemoScenarioFiles).toBe('function')
    if (!createDemoFileLoadGate || !loadDemoScenarioFiles) return
    const gate = createDemoFileLoadGate()
    const responseA = deferred<Response>()
    const responseB = deferred<Response>()
    const fetchImpl = vi.fn((input: RequestInfo | URL) =>
      String(input).includes('demo-a') ? responseA.promise : responseB.promise,
    )
    const beginLoad = vi.fn()

    const loadA = loadDemoScenarioFiles({
      scenario: {
        files: [{ path: '/demo-a.pdf', filename: 'demo-a.pdf' }],
      },
      gate,
      onBeginLoad: beginLoad,
      fetchImpl,
    })
    const loadB = loadDemoScenarioFiles({
      scenario: {
        files: [{ path: '/demo-b.pdf', filename: 'demo-b.pdf' }],
      },
      gate,
      onBeginLoad: beginLoad,
      fetchImpl,
    })
    responseA.resolve(new Response('late A'))
    responseB.resolve(new Response('current B'))

    await expect(loadA).resolves.toEqual({ status: 'cancelled' })
    await expect(loadB).resolves.toMatchObject({
      status: 'success',
      files: [expect.objectContaining({ name: 'demo-b.pdf' })],
    })
    expect(beginLoad).toHaveBeenCalledTimes(2)
  })

  it('rotates the referral once for a successful demo and not during reconciliation', async () => {
    expect(typeof createDemoFileLoadGate).toBe('function')
    expect(typeof loadDemoScenarioFiles).toBe('function')
    if (!createDemoFileLoadGate || !loadDemoScenarioFiles) return
    const beginLoad = vi.fn()

    const result = await loadDemoScenarioFiles({
      scenario: {
        files: [{ path: '/demo-success.pdf', filename: 'demo-success.pdf' }],
      },
      gate: createDemoFileLoadGate(),
      onBeginLoad: beginLoad,
      fetchImpl: async () => new Response('success'),
    })
    const reconcileFiles = vi.fn()
    const activateUploadMode = vi.fn()
    if (result.status === 'success') {
      reconcileFiles(result.files)
      activateUploadMode()
    }

    expect(beginLoad).toHaveBeenCalledOnce()
    expect(reconcileFiles).toHaveBeenCalledOnce()
    expect(activateUploadMode).toHaveBeenCalledOnce()
  })
})
