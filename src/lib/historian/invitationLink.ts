interface InvitationHashSource {
  location: Pick<Location, 'hash' | 'pathname' | 'search'>
  history: Pick<History, 'replaceState'>
  addEventListener: (type: 'hashchange', listener: EventListener) => void
  removeEventListener: (type: 'hashchange', listener: EventListener) => void
}

function consumeInvitationToken(source: InvitationHashSource): string | null {
  const params = new URLSearchParams(source.location.hash.replace(/^#/, ''))
  const token = params.get('token')?.trim() || null

  // Remove a bearer from the visible URL before analytics, navigation, or a
  // support screenshot can retain it. replaceState does not emit hashchange.
  if (source.location.hash) {
    source.history.replaceState(
      null,
      '',
      source.location.pathname + source.location.search,
    )
  }
  return token
}

/**
 * Reads the initial invitation fragment and observes later fragments. A later
 * token matters when a mobile/in-app browser reuses an already-open invite tab:
 * changing only `#token=...` does not reload React or rerun a mount-only effect.
 */
export function observeHistorianInvitationTokens(
  source: InvitationHashSource,
  onToken: (token: string) => void,
): { initialToken: string | null; dispose: () => void } {
  const handleHashChange: EventListener = () => {
    const token = consumeInvitationToken(source)
    if (token) onToken(token)
  }

  source.addEventListener('hashchange', handleHashChange)
  return {
    initialToken: consumeInvitationToken(source),
    dispose: () => source.removeEventListener('hashchange', handleHashChange),
  }
}
