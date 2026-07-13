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
      style={{
        padding: '16px',
        background: 'rgba(180, 83, 9, 0.12)',
        borderRadius: '8px',
        border: '1px solid #D97706',
      }}
    >
      <h3
        style={{
          color: '#FDE68A',
          fontSize: '0.9rem',
          fontWeight: 700,
          margin: '0 0 8px',
        }}
      >
        Missing information — active action remains
      </h3>
      {humanReviewHold && (
        <p
          style={{
            color: '#FCD34D',
            fontSize: '0.8rem',
            fontWeight: 700,
            lineHeight: 1.5,
            margin: '0 0 8px',
          }}
        >
          Human review hold: reconcile the conflicting source information
          before final disposition.
        </p>
      )}
      <p
        style={{
          color: '#E2E8F0',
          fontSize: '0.8rem',
          lineHeight: 1.5,
          margin: '0 0 8px',
        }}
      >
        {copy.action} {copy.noDelay}
      </p>
      <p
        style={{
          color: schedulingLocked ? '#FCA5A5' : '#CBD5E1',
          fontSize: '0.78rem',
          fontWeight: 700,
          margin: '0 0 10px',
        }}
      >
        {schedulingLocked
          ? 'Scheduling remains locked.'
          : 'Scheduling is not currently locked.'}
      </p>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {missingInformation.map((item, index) => (
          <li
            key={`${item}-${index}`}
            style={{
              color: '#E2E8F0',
              fontSize: '0.82rem',
              lineHeight: 1.6,
              marginBottom:
                index < missingInformation.length - 1 ? '4px' : 0,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
