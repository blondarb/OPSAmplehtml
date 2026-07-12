import vm from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

import { PATIENT_ACCESS_EXCHANGE_SCRIPT } from '../exchangePage'

function runExchange(input: {
  href: string
  response?: { ok: boolean; body: Record<string, unknown> }
}) {
  const order: string[] = []
  const status = { textContent: '' }
  let clearHandler: (() => void) | undefined
  const clearButton = {
    hidden: true,
    disabled: false,
    addEventListener: vi.fn((_event: string, handler: () => void) => {
      clearHandler = handler
    }),
  }
  const replaceState = vi.fn((_state, _title, path: string) => {
    order.push(`strip:${path}`)
  })
  const navigate = vi.fn((path: string) => {
    order.push(`navigate:${path}`)
  })
  const fetchMock = vi.fn((url: string, _init: RequestInit) => {
    void _init
    order.push(`fetch:${url}`)
    return Promise.resolve({
      ok: input.response?.ok ?? true,
      json: () =>
        Promise.resolve(
          input.response?.body ?? {
            success: true,
            redirect_path: '/patient/historian',
          },
        ),
    })
  })
  const window = {
    location: { href: input.href, replace: navigate },
    history: { replaceState },
    fetch: fetchMock,
  }
  const document = {
    getElementById: vi.fn((id: string) =>
      id === 'patient-access-clear-session' ? clearButton : status,
    ),
  }

  vm.runInNewContext(PATIENT_ACCESS_EXCHANGE_SCRIPT, {
    window,
    document,
    URL,
    URLSearchParams,
    JSON,
    Promise,
  })

  return {
    order,
    status,
    clearButton,
    clickClear: () => clearHandler?.(),
    replaceState,
    navigate,
    fetchMock,
  }
}

describe('patient access fragment exchange bootstrap', () => {
  it('strips the fragment before the only same-origin network call and then discards it', async () => {
    const secret = 'invite.header.payload.signature'
    const result = runExchange({
      href: `https://app.example.test/patient/access#capability=${secret}`,
    })

    expect(result.order[0]).toBe('strip:/patient/access')
    expect(result.order[1]).toBe('fetch:/api/patient-access/redeem')
    expect(result.fetchMock).toHaveBeenCalledWith(
      '/api/patient-access/redeem',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability_token: secret }),
      }),
    )

    await vi.waitFor(() => {
      expect(result.navigate).toHaveBeenCalledWith('/patient/historian')
    })
    expect(result.replaceState.mock.calls[0][2]).not.toContain(secret)
    expect(JSON.stringify(result.order)).not.toContain(secret)
  })

  it('removes but never accepts a query-string capability', async () => {
    const secret = 'query-secret'
    const result = runExchange({
      href: `https://app.example.test/patient/access?capability=${secret}`,
    })

    expect(result.replaceState).toHaveBeenCalledWith(null, '', '/patient/access')
    expect(result.fetchMock).not.toHaveBeenCalled()
    expect(result.navigate).not.toHaveBeenCalled()
    expect(result.status.textContent).toBe(
      'This access link is invalid or has expired. Please request a new link.',
    )
    expect(result.replaceState.mock.calls[0][2]).not.toContain(secret)
  })

  it.each([
    'https://attacker.example.test/patient/historian',
    '//attacker.example.test/patient/historian',
    '/patient/historian?capability=leaked',
    '/patient/messages',
  ])('refuses a server redirect outside the exact patient allowlist: %s', async (redirect) => {
    const result = runExchange({
      href: 'https://app.example.test/patient/access#capability=valid-token',
      response: { ok: true, body: { success: true, redirect_path: redirect } },
    })

    await vi.waitFor(() => {
      expect(result.status.textContent).toBe(
        'This access link is invalid or has expired. Please request a new link.',
      )
    })
    expect(result.navigate).not.toHaveBeenCalled()
  })

  it('rejects ambiguous fragments without making a request', () => {
    const result = runExchange({
      href: 'https://app.example.test/patient/access#capability=one&capability=two',
    })

    expect(result.replaceState).toHaveBeenCalledOnce()
    expect(result.fetchMock).not.toHaveBeenCalled()
    expect(result.navigate).not.toHaveBeenCalled()
  })

  it('offers a same-origin cookie clear after an exchange error', async () => {
    const result = runExchange({
      href: 'https://app.example.test/patient/access#capability=invalid-token',
      response: { ok: false, body: {} },
    })

    await vi.waitFor(() => expect(result.clearButton.hidden).toBe(false))
    result.clickClear()

    await vi.waitFor(() => {
      expect(result.fetchMock).toHaveBeenCalledWith(
        '/api/patient-access/session',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      )
    })
  })

  it('contains no persistent storage or third-party endpoint', () => {
    expect(PATIENT_ACCESS_EXCHANGE_SCRIPT).not.toMatch(
      /localStorage|sessionStorage|https?:\/\//,
    )
  })
})
