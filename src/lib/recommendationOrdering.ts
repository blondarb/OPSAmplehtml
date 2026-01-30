/**
 * Canonical section and subsection ordering for Smart Recommendations.
 *
 * PRD rules:
 *  - Sections: Labs → Imaging → Treatment → Other Recommendations
 *  - Subsections: Essential/First-Line first, Rare/Specialized last
 *  - Legacy section names (e.g. "Referrals & Follow-up", "Patient Instructions")
 *    are mapped into the canonical ordering without restructuring plan data.
 */

// Top-level section order (includes both canonical and legacy names)
export const SECTION_ORDER = [
  'Laboratory Workup',
  'Imaging & Studies',
  'Treatment',
  'Other Recommendations',
  // Legacy top-level names kept for backward-compat ordering
  'Referrals & Follow-up',
  'Patient Instructions',
]

// Subsection ordering per section — items earlier in the array render first.
// Legacy names are included so existing neuro-plans data sorts correctly.
export const SUBSECTION_ORDER_MAP: Record<string, string[]> = {
  'Laboratory Workup': [
    // Essential / Core
    'Essential Labs',
    'Baseline Labs (Pre-DMT)',
    // Routine / Monitoring
    'Routine Monitoring',
    // Specialised screening groups
    'Toxicology',
    'Infectious Disease Screening',
    // Extended / Expanded
    'Extended Workup',
    'Additional Testing',
    'If Specific Etiology Suspected',
    'If Autoimmune Suspected',
    'If Etiology Undetermined',
    // LP / CSF always last
    'Lumbar Puncture / CSF',
  ],

  'Imaging & Studies': [
    // Essential / First-Line
    'Essential Imaging',
    'Baseline MRI',
    // Electrodiagnostic
    'Electrodiagnostic Studies',
    // Cardiac & Vascular
    'Cardiac Evaluation',
    'Vascular Imaging',
    // Follow-up
    'Follow-up Imaging',
    'Follow-up Brain Imaging',
    // Extended / Optional
    'Other Studies',
    'Imaging',
    'Additional Studies',
    'Additional Testing',
    'Specialized',
    'If Refractory',
  ],

  Treatment: [
    // First-Line / Standard
    'First-Line ASMs',
    'Antiplatelet Therapy',
    'Treat Underlying Cause',
    'Neuropathic Pain Management - First Line',
    // Disease-Specific Targeted
    'Platform/Moderate Efficacy DMTs',
    'Higher Efficacy DMTs',
    // Second-Line / Advanced
    'ASM Optimization',
    'Risk Factor Management',
    'Second-Line Options',
    'Second Line Options',
    'Anticoagulation (if AFib/cardioembolic)',
    // Rescue / Emergent
    'Rescue Medications',
    // Symptomatic
    'Symptomatic Management',
    'Topical Therapies',
    'Neuroprotection',
  ],

  // "Other Recommendations" subsection order (PRD 3.1)
  'Other Recommendations': [
    'Referrals & Consults',
    'Lifestyle & Prevention',
    'Risk Reduction',
    'Patient Instructions & Education',
  ],

  // Legacy "Referrals & Follow-up" section keeps its own subsection ordering
  'Referrals & Follow-up': [
    'Essential',
    'Rehabilitation',
    'Additional',
    'Supportive',
    'Specialized',
  ],
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
 * Names not in the map are appended at the end in their original order.
 */
export function sortSubsections(section: string, names: string[]): string[] {
  const orderList = SUBSECTION_ORDER_MAP[section] || []
  return [...names].sort((a, b) => {
    const idxA = orderList.indexOf(a)
    const idxB = orderList.indexOf(b)
    const orderA = idxA === -1 ? 999 : idxA
    const orderB = idxB === -1 ? 999 : idxB
    return orderA - orderB
  })
}
