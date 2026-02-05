'use client'

import {
  SDNEDomain,
  SDNEFlag,
  SDNE_DOMAIN_LABELS,
  SDNE_FLAG_THEME,
  SDNE_FLAG_KEY,
} from '@/lib/sdneTypes'

interface SDNEDomainSummaryProps {
  domainFlags: Record<SDNEDomain, SDNEFlag>
}

// Domain icons as SVG paths (avoiding external icon library dependency)
const DOMAIN_ICONS: Record<SDNEDomain, React.ReactNode> = {
  Cognition: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a8 8 0 0 0-8 8c0 3.33 1.94 6.17 4.74 7.5L9 22h6l.26-4.5A8.02 8.02 0 0 0 20 10a8 8 0 0 0-8-8z"/>
      <path d="M9.5 9.5h.01M14.5 9.5h.01"/>
    </svg>
  ),
  Oculomotor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Facial: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
      <line x1="9" x2="9.01" y1="9" y2="9"/>
      <line x1="15" x2="15.01" y1="9" y2="9"/>
    </svg>
  ),
  Motor: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5 17.5 17.5"/>
      <path d="M6.5 6.5a4 4 0 0 0 4 4h3a4 4 0 0 0 4-4"/>
      <path d="M17.5 17.5a4 4 0 0 0-4-4h-3a4 4 0 0 0-4 4"/>
    </svg>
  ),
  Coordination: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
      <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
      <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
    </svg>
  ),
  Language: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6V2H8"/>
      <path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/>
      <path d="M2 12h2"/>
      <path d="M9 11v2"/>
      <path d="M15 11v2"/>
      <path d="M9 15c1 1 2 1 3 0"/>
    </svg>
  ),
  Gait: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2"/>
      <path d="M14 22v-4l-1-1-2-3v-3l-3 3-3 1"/>
      <path d="M10 22v-8l2-1h3l3 5"/>
      <path d="M15 11l3-3"/>
    </svg>
  ),
  Setup: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
}

// Display order for domains (Setup last as it's less clinically relevant)
const DOMAIN_ORDER: SDNEDomain[] = [
  'Cognition',
  'Oculomotor',
  'Facial',
  'Motor',
  'Coordination',
  'Language',
  'Gait',
  'Setup',
]

/**
 * 8-domain heatmap summary card for SDNE exam results
 * Shows at-a-glance status for each neurologic domain
 */
export function SDNEDomainSummary({ domainFlags }: SDNEDomainSummaryProps) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-1">Domain Summary</h4>
      <p className="text-xs text-gray-500 mb-3">At-a-glance results across all neurologic domains</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {DOMAIN_ORDER.map((domain) => {
          const flag = domainFlags[domain]
          const colors = SDNE_FLAG_THEME[SDNE_FLAG_KEY[flag]]

          return (
            <div
              key={domain}
              style={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
              }}
              className="p-3 rounded-lg transition-all duration-150 hover:shadow-md cursor-default"
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: colors.main }}>
                  {DOMAIN_ICONS[domain]}
                </span>
                <span
                  style={{ color: colors.text }}
                  className="text-xs font-semibold"
                >
                  {domain}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {SDNE_DOMAIN_LABELS[domain]}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
