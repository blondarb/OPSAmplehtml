'use client'

interface Props {
  reasons: string[]
}

export default function ClinicalReasons({ reasons }: Props) {
  if (!reasons.length) return null

  return (
    <div className="nn-card" style={{ margin: 0 }}>
      <h3 className="nn-card-title" style={{ marginBottom: 10 }}>
        Top Clinical Reasons
      </h3>
      <ol className="nn-list">
        {reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ol>
    </div>
  )
}
