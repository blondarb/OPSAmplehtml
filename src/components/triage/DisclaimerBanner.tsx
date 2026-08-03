'use client'

import { DISCLAIMER_TEXT } from '@/lib/triage/types'

export default function DisclaimerBanner() {
  return (
    <div className="nn-caveat" style={{ marginTop: 16, marginBottom: 0 }}>
      {DISCLAIMER_TEXT}
    </div>
  )
}
