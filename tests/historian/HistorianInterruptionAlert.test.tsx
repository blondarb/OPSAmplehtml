import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HistorianInterruptionAlert from '@/components/historian/HistorianInterruptionAlert'

describe('HistorianInterruptionAlert', () => {
  it('renders nothing when there is no error', () => {
    expect(renderToStaticMarkup(<HistorianInterruptionAlert error={null} />)).toBe('')
    expect(renderToStaticMarkup(<HistorianInterruptionAlert error={undefined} />)).toBe('')
    expect(renderToStaticMarkup(<HistorianInterruptionAlert error="" />)).toBe('')
  })

  it('renders an alert with the fixed patient-facing copy when an error is set', () => {
    const markup = renderToStaticMarkup(
      <HistorianInterruptionAlert error="modelStreamErrorException: Model has timed out in processing the request. Try your request again." />,
    )
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('nn-alert')
    // renderToStaticMarkup serializes the JSX `&apos;` entity as `&#x27;` in
    // the raw HTML string (same escaping the rest of this repo's patient-
    // facing copy relies on — see e.g. HistorianReportView.tsx).
    expect(markup).toContain(
      "The connection to your interviewer was interrupted. Everything you&#x27;ve shared so far has been saved for your neurologist.",
    )
  })

  it('never leaks the raw provider/relay error message to the patient', () => {
    const rawMessage = 'modelStreamErrorException: Model has timed out in processing the request. Try your request again.'
    const markup = renderToStaticMarkup(<HistorianInterruptionAlert error={rawMessage} />)
    expect(markup).not.toContain(rawMessage)
    expect(markup).not.toContain('modelStreamErrorException')
  })
})
