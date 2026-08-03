'use client'

interface Props {
  missingInformation: readonly string[] | null | undefined
  timeframe: string
  schedulingLocked: boolean
  humanReviewHold?: boolean
}

function activeActionCopy(timeframe: string): {
  action: string
  noDelay: string
} {
  if (timeframe === 'Emergency evaluation now') {
    return {
      action: 'The active emergency action remains in effect.',
      noDelay: 'Information gathering must not delay emergency evaluation.',
    }
  }
  if (timeframe === 'Same-day clinician review') {
    return {
      action: 'Same-day clinician review remains the active action.',
      noDelay:
        'Information gathering must not delay same-day clinician review.',
    }
  }
  return {
    action: `${timeframe} remains the active triage timeframe.`,
    noDelay: 'Information gathering must not delay this action.',
  }
}

export default function MissingInformationPanel({
  missingInformation,
  timeframe,
  schedulingLocked,
  humanReviewHold = false,
}: Props) {
  if (!missingInformation?.length) return null
  const copy = activeActionCopy(timeframe)

  return (
    <section
      aria-label="Missing information with active triage action"
      className="nn-note"
      style={{ margin: 0 }}
    >
      <h3>Missing information — active action remains</h3>
      {humanReviewHold && (
        <p style={{ fontWeight: 700, margin: '0 0 8px' }}>
          Human review hold: reconcile the conflicting source information
          before final disposition.
        </p>
      )}
      <p style={{ margin: '0 0 8px' }}>
        {copy.action} {copy.noDelay}
      </p>
      <p style={{ fontWeight: 700, margin: '0 0 10px', color: schedulingLocked ? 'var(--nn-t1)' : undefined }}>
        {schedulingLocked
          ? 'Scheduling remains locked.'
          : 'Scheduling is not currently locked.'}
      </p>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {missingInformation.map((item, index) => (
          <li key={`${item}-${index}`} style={{ marginBottom: index < missingInformation.length - 1 ? '4px' : 0 }}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
