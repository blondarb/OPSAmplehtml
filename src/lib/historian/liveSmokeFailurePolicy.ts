/** Only unavailable provider/IAM/transport conditions are NOT_RUN. */
export function isUnavailableLiveProviderFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /not authorized|accessdenied|unauthorized|credential|\b(?:econnrefused|econnreset|econnaborted|enotfound|eai_again)\b|network error|socket hang up|connect etimedout|serviceunavailable|throttlingexception/i.test(message)
}
