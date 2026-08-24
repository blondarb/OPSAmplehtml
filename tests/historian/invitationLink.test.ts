import { describe, expect, it, vi } from 'vitest'
import { observeHistorianInvitationTokens } from '@/lib/historian/invitationLink'

function fakeHashSource(initialHash = '') {
  let hash = initialHash
  let listener: EventListener | null = null
  const replaceState = vi.fn(() => {
    hash = ''
  })
  const source = {
    location: {
      get hash() { return hash },
      pathname: '/patient/historian/invite',
      search: '',
    },
    history: { replaceState },
    addEventListener: vi.fn((_type: 'hashchange', next: EventListener) => {
      listener = next
    }),
    removeEventListener: vi.fn((_type: 'hashchange', current: EventListener) => {
      if (listener === current) listener = null
    }),
  }
  return {
    source,
    setHash(next: string) { hash = next },
    dispatchHashChange() { listener?.(new Event('hashchange')) },
    replaceState,
  }
}

describe('Historian invitation fragment observer', () => {
  it('consumes and scrubs the initial bearer before returning it', () => {
    const fixture = fakeHashSource('#token=initial-bearer')
    const onToken = vi.fn()
    const observer = observeHistorianInvitationTokens(fixture.source, onToken)

    expect(observer.initialToken).toBe('initial-bearer')
    expect(onToken).not.toHaveBeenCalled()
    expect(fixture.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/patient/historian/invite',
    )
    observer.dispose()
  })

  it('recovers when a new link changes only the hash in an existing error tab', () => {
    const fixture = fakeHashSource()
    const onToken = vi.fn()
    const observer = observeHistorianInvitationTokens(fixture.source, onToken)

    expect(observer.initialToken).toBeNull()
    fixture.setHash('#token=replacement-bearer')
    fixture.dispatchHashChange()

    expect(onToken).toHaveBeenCalledWith('replacement-bearer')
    expect(fixture.replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      '/patient/historian/invite',
    )
    observer.dispose()
    fixture.setHash('#token=ignored-after-dispose')
    fixture.dispatchHashChange()
    expect(onToken).toHaveBeenCalledTimes(1)
  })
})
