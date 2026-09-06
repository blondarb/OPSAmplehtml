/** Queue execution is opt-in; all other values preserve the save-route chain. */
export function selectHistorianEvalMode(env: string | undefined): 'queue' | 'inline' {
  return env === 'queue' ? 'queue' : 'inline'
}
