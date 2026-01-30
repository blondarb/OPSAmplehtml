/**
 * Canonical section and subsection ordering for Smart Recommendations.
 *
 * PRD rules:
 *  - Sections: Labs → Imaging → Treatment → Other Recommendations
 *  - Subsections: Essential/First-Line first, Rare/Specialized last
 *
 * The actual subsection names come from the neuro-plans repository.
 * Labs/Imaging/Other have a small fixed set of names.
 * Treatment subsections vary widely per plan, so we use keyword-based
 * priority tiers instead of an exact name list.
 */

// Top-level section order
export const SECTION_ORDER = [
  'Laboratory Workup',
  'Imaging & Studies',
  'Treatment',
  'Other Recommendations',
  // Legacy top-level names kept for backward-compat ordering
  'Referrals & Follow-up',
  'Patient Instructions',
]

// Exact subsection ordering for sections with a fixed set of subsection names
export const SUBSECTION_ORDER_MAP: Record<string, string[]> = {
  'Laboratory Workup': [
    'Essential/Core Labs',
    'Extended Workup',
    'Rare/Specialized',
    'Lumbar Puncture',
  ],

  'Imaging & Studies': [
    'Essential/First-line',
    'Extended',
    'Rare/Specialized',
  ],

  'Other Recommendations': [
    'Referrals & Consults',
    'Lifestyle & Prevention',
    'Patient Instructions',
  ],

  // Legacy section
  'Referrals & Follow-up': [
    'Essential',
    'Rehabilitation',
    'Additional',
    'Supportive',
    'Specialized',
  ],
}

// Treatment subsections use keyword-based priority tiers (lower = earlier).
// Subsections not matching any keyword get tier 50 (middle).
const TREATMENT_TIER_KEYWORDS: [number, RegExp][] = [
  // Tier 1: Acute / Emergent / Stabilization — always first
  [1, /^stabiliz/i],
  [2, /acute.*emerg|emerg.*acute/i],
  [3, /^acute/i],
  [4, /emergent|urgent/i],

  // Tier 10: First-line / Essential / Primary treatments
  [10, /first[- ]line/i],
  [11, /essential|core|primary|foundation/i],
  [12, /^empiric/i],
  [13, /corticosteroid/i],
  [14, /antiviral/i],

  // Tier 20: Disease-modifying / Preventive / Standard therapies
  [20, /disease[- ]modif/i],
  [21, /preventive|prevention/i],
  [22, /dopamin|levodopa/i],
  [23, /cholinesterase|nmda/i],
  [24, /immunotherapy|immunosuppress/i],
  [25, /^maintenance/i],
  [26, /secondary prevention/i],
  [27, /pharmacologic/i],

  // Tier 30: Second-line / Adjunctive / Targeted
  [30, /second[- ]line/i],
  [31, /adjunct/i],
  [32, /targeted|specific/i],
  [33, /biologic/i],
  [34, /steroid[- ]spar/i],
  [35, /combination/i],

  // Tier 40: Symptomatic / Supportive / Non-motor
  [40, /symptomatic/i],
  [41, /supportive/i],
  [42, /non[- ]motor/i],
  [43, /non[- ]pharmacol/i],
  [44, /pain management/i],
  [45, /neuropathic pain/i],
  [46, /behavioral|psychiatric|mood|sleep|cognit|fatigue|autonomic/i],
  [47, /headache management|vestibular|visual/i],
  [48, /nutritional|weight|lifestyle/i],
  [49, /rehabilitation|physical therapy/i],

  // Tier 60: Third-line / Refractory / Advanced
  [60, /third[- ]line/i],
  [61, /refractory/i],
  [62, /advanced|rescue/i],
  [63, /interventional/i],

  // Tier 70: Surgical
  [70, /surgical/i],

  // Tier 80: Medications to avoid / special populations / pregnancy
  [80, /avoid/i],
  [81, /pregnancy/i],
  [82, /withdrawal/i],
  [83, /transition/i],

  // Tier 90: Complications / Post-treatment
  [90, /complication/i],
  [91, /post-/i],
]

/**
 * Get a numeric priority tier for a Treatment subsection name.
 * Lower numbers appear first. Unmatched names get tier 50.
 */
function getTreatmentTier(name: string): number {
  for (const [tier, pattern] of TREATMENT_TIER_KEYWORDS) {
    if (pattern.test(name)) return tier
  }
  return 50 // default middle tier
}

/**
 * Sort an array of section names according to canonical order.
 * Names not in SECTION_ORDER are appended at the end in their original order.
 */
export function sortSections(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const idxA = SECTION_ORDER.indexOf(a)
    const idxB = SECTION_ORDER.indexOf(b)
    const orderA = idxA === -1 ? 999 : idxA
    const orderB = idxB === -1 ? 999 : idxB
    return orderA - orderB
  })
}

/**
 * Sort subsection names within a given section according to canonical order.
 * For Treatment sections, uses keyword-based tier sorting.
 * For other sections, uses the exact name list in SUBSECTION_ORDER_MAP.
 * Names not in the map are appended at the end in their original order.
 */
export function sortSubsections(section: string, names: string[]): string[] {
  // Treatment uses keyword-based tiers
  if (section === 'Treatment') {
    return [...names].sort((a, b) => getTreatmentTier(a) - getTreatmentTier(b))
  }

  // Other sections use exact name ordering
  const orderList = SUBSECTION_ORDER_MAP[section] || []
  return [...names].sort((a, b) => {
    const idxA = orderList.indexOf(a)
    const idxB = orderList.indexOf(b)
    const orderA = idxA === -1 ? 999 : idxA
    const orderB = idxB === -1 ? 999 : idxB
    return orderA - orderB
  })
}
