/**
 * Fire-and-forget background work pattern for Amplify Hosting Compute.
 *
 * Why this exists: Amplify buffers Next.js streaming responses despite
 * `text/event-stream` headers (verified empirically — see PR #110/#111).
 * Any request taking >30s hits CloudFront's origin read timeout.
 *
 * This helper schedules work that should outlive the request. AWS Lambda's
 * Node runtime keeps the function alive while pending promises exist
 * (callbackWaitsForEmptyEventLoop = true, the default), so a non-awaited
 * promise continues running after the response is sent — bounded by the
 * route's `maxDuration`. The pattern works because Bedrock + DB total stays
 * well under that.
 *
 * Errors are logged but never thrown back into the response path; the
 * background work is responsible for persisting its own error state
 * (e.g. updating a row to status='error' so the polling client sees it).
 */
export function runInBackground(work: () => Promise<void>): void {
  void work().catch((err) => {
    console.error('[asyncRunner] Background work threw:', err)
  })
}
