export interface HistorianEvalDispatcherDependencies {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: { id: string }[] }>
  sendMessages: (entries: { id: string; body: string }[]) => Promise<{ failedEntryIds: string[] }>
  now: () => Date
}

export async function dispatchHistorianEvaluations(deps: HistorianEvalDispatcherDependencies) {
  const { rows } = await deps.query(`SELECT id FROM historian_sessions
    WHERE (final_differential->>'status' = 'pending'
      OR (final_differential->>'status' = 'queued'
        AND (final_differential->>'queued_at')::timestamptz < now() - interval '60 minutes'))
      AND created_at > now() - interval '48 hours'
    ORDER BY created_at LIMIT 20`)
  let enqueued = 0
  let batchCount = 0
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = rows.slice(offset, offset + 10)
    const enqueuedAt = deps.now().toISOString()
    const entries = batch.map((row, i) => ({
      id: `eval-${offset + i}`,
      body: JSON.stringify({ sessionId: row.id, enqueuedAt }),
    }))
    // Rejected sends throw before any mark; partial successes are marked individually.
    const { failedEntryIds } = await deps.sendMessages(entries)
    batchCount++
    if (failedEntryIds.some((id) => !entries.some((entry) => entry.id === id))) {
      throw new Error('Invalid historian evaluation batch response')
    }
    for (let i = 0; i < batch.length; i++) {
      if (failedEntryIds.includes(entries[i].id)) continue
      // The worker can finish before SendMessageBatch returns: never replace its result.
      await deps.query(`UPDATE historian_sessions
        SET final_differential = final_differential || $1::jsonb
        WHERE id = $2 AND (final_differential->>'status' = 'pending'
      OR (final_differential->>'status' = 'queued'
        AND (final_differential->>'queued_at')::timestamptz < now() - interval '60 minutes'))`, [
        JSON.stringify({ status: 'queued', queued_at: enqueuedAt }), batch[i].id,
      ])
      enqueued++
    }
  }
  return { discovered: rows.length, enqueued, batchCount }
}
