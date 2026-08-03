'use client'

interface Props {
  workup: string[]
}

export default function PreVisitWorkup({ workup }: Props) {
  if (!workup.length) return null

  return (
    <div className="nn-card" style={{ margin: 0 }}>
      <h3 className="nn-card-title">Start before the visit</h3>
      <p className="nn-hint">
        Suggested workup to communicate to the referring provider for ordering
        before the neurology visit.
      </p>
      <ol className="nn-list">
        {workup.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </div>
  )
}
