import type { LongPacketProgress } from './pollClient'

export function formatLongPacketProgress(
  progress: Readonly<LongPacketProgress>,
): string {
  if (
    progress.run_status === 'failed' ||
    progress.finalizer_status === 'failed'
  ) {
    return 'Packet processing needs human review.'
  }

  const chunksComplete =
    progress.mapper.completed === progress.expected_chunks &&
    progress.safety.completed === progress.expected_chunks &&
    progress.mapper.failed === 0 &&
    progress.safety.failed === 0 &&
    progress.mapper.leased === 0 &&
    progress.safety.leased === 0
  if (
    chunksComplete ||
    progress.finalizer_status === 'leased' ||
    progress.finalizer_status === 'complete' ||
    progress.run_status === 'complete'
  ) {
    return 'Finalizing packet review…'
  }

  const active = progress.mapper.leased + progress.safety.leased
  const failed = progress.mapper.failed + progress.safety.failed
  if (
    progress.run_status === 'pending' &&
    progress.mapper.completed === 0 &&
    progress.safety.completed === 0 &&
    active === 0 &&
    failed === 0
  ) {
    return 'Preparing packet review…'
  }

  const parts = [
    `Clinical mapping ${progress.mapper.completed}/${progress.expected_chunks}`,
    `Safety review ${progress.safety.completed}/${progress.expected_chunks}`,
  ]
  if (active > 0) parts.push(`${active} active`)
  if (failed > 0) parts.push(`${failed} awaiting retry/review`)
  return parts.join(' · ')
}

