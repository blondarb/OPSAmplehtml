'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  type ClinicalPlan,
  type RecommendationItem,
  type StructuredDosing,
  type DoseOption,
} from '@/lib/recommendationPlans'
import { sortSections, sortSubsections } from '@/lib/recommendationOrdering'
import type { SavedPlan } from '@/lib/savedPlanTypes'

interface SmartRecommendationsSectionProps {
  onAddToPlan: (items: string[]) => void
  selectedDiagnoses?: string[] // Array of diagnosis IDs from the Differential Diagnosis section
}

// Priority badge colors
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  'STAT': { bg: '#FEE2E2', text: '#DC2626' },
  'URGENT': { bg: '#FEF3C7', text: '#D97706' },
  'ROUTINE': { bg: '#DBEAFE', text: '#2563EB' },
  'EXT': { bg: '#E5E7EB', text: '#6B7280' },
  '✓': { bg: '#D1FAE5', text: '#059669' },
  '—': { bg: '#F3F4F6', text: '#9CA3AF' },
}

// Section and subsection ordering now imported from @/lib/recommendationOrdering

// Icon tooltip types
type TooltipType = 'rationale' | 'indication' | 'timing' | 'target' | 'contraindications' | 'monitoring'

const TOOLTIP_ICONS: Record<TooltipType, { icon: JSX.Element; label: string; color: string; darkColor: string; bg: string; darkBg: string }> = {
  rationale: {
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
    label: 'Rationale',
    color: '#2563EB',
    darkColor: '#60A5FA',
    bg: '#DBEAFE',
    darkBg: '#1E3A5F',
  },
  indication: {
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>,
    label: 'Indication',
    color: '#DC2626',
    darkColor: '#F87171',
    bg: '#FEE2E2',
    darkBg: '#4C1D1D',
  },
  timing: {
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    label: 'Timing',
    color: '#7C3AED',
    darkColor: '#A78BFA',
    bg: '#EDE9FE',
    darkBg: '#3B1F6E',
  },
  target: {
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    label: 'Target',
    color: '#059669',
    darkColor: '#34D399',
    bg: '#D1FAE5',
    darkBg: '#1A3A2A',
  },
  contraindications: {
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    label: 'Contraindications',
    color: '#DC2626',
    darkColor: '#F87171',
    bg: '#FEE2E2',
    darkBg: '#4C1D1D',
  },
  monitoring: {
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
    label: 'Monitoring',
    color: '#0891B2',
    darkColor: '#22D3EE',
    bg: '#CFFAFE',
    darkBg: '#164E63',
  },
}

export default function SmartRecommendationsSection({
  onAddToPlan,
  selectedDiagnoses = [],
}: SmartRecommendationsSectionProps) {
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [expandedSubsections, setExpandedSubsections] = useState<Record<string, boolean>>({})
  const [selectedItems, setSelectedItems] = useState<Map<string, Set<string>>>(new Map())
  const [showPlanBuilder, setShowPlanBuilder] = useState(false)
  const [activeReferenceTab, setActiveReferenceTab] = useState<'icd' | 'scope' | 'pearls' | 'differential' | 'evidence' | 'monitoring' | null>(null)
  const [activeTooltip, setActiveTooltip] = useState<{ itemKey: string; type: TooltipType } | null>(null)
  const [expandedDosing, setExpandedDosing] = useState<Set<string>>(new Set())
  const [customItems, setCustomItems] = useState<Record<string, string>>({})
  const [showLegend, setShowLegend] = useState(false)
  const [addedConfirmation, setAddedConfirmation] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  // Track selected dose option per item (itemKey -> selected orderSentence or 'custom')
  const [selectedDoseOptions, setSelectedDoseOptions] = useState<Record<string, string>>({})
  // Track custom dose text per item when 'custom' is selected
  const [customDoseText, setCustomDoseText] = useState<Record<string, string>>({})

  // Detect dark mode
  useEffect(() => {
    const check = () => setIsDarkMode(document.documentElement.getAttribute('data-theme') === 'dark')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // State for Supabase data
  const [availablePlans, setAvailablePlans] = useState<{ plan_id: string; title: string; icd10_codes: string[]; linked_diagnoses: string[]; diagnosis_scores?: Record<string, number> }[]>([])
  const [currentPlan, setCurrentPlan] = useState<ClinicalPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Saved plans state
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)
  const [savePlanName, setSavePlanName] = useState('')
  const [savePlanDescription, setSavePlanDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Plan search state
  const [planSearchQuery, setPlanSearchQuery] = useState('')
  const [planSearchResults, setPlanSearchResults] = useState<{ plan_id: string; title: string; icd10_codes: string[]; linked_diagnoses: string[]; diagnosis_scores?: Record<string, number> }[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Fetch all available plans on mount
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch('/api/plans?list=true')
        if (response.ok) {
          const data = await response.json()
          setAvailablePlans(data.plans || [])
        }
      } catch (err) {
        console.error('Failed to fetch plans list:', err)
      }
    }
    fetchPlans()
  }, [])

  // Fetch plan for selected diagnosis
  const fetchPlanForDiagnosis = useCallback(async (diagnosisId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/plans?diagnosisId=${encodeURIComponent(diagnosisId)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.plan) {
          setCurrentPlan(data.plan)
          setShowPlanBuilder(true)
        } else {
          setError('No plan found for this diagnosis')
          setCurrentPlan(null)
        }
      } else {
        setError('Failed to fetch plan')
        setCurrentPlan(null)
      }
    } catch (err) {
      console.error('Failed to fetch plan:', err)
      setError('Failed to fetch plan')
      setCurrentPlan(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch plan by its plan_key directly (used by search)
  const fetchPlanByKey = useCallback(async (planKey: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/plans?planKey=${encodeURIComponent(planKey)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.plan) {
          setCurrentPlan(data.plan)
          setShowPlanBuilder(true)
        } else {
          setError('Plan not found')
          setCurrentPlan(null)
        }
      } else {
        setError('Failed to fetch plan')
        setCurrentPlan(null)
      }
    } catch (err) {
      console.error('Failed to fetch plan by key:', err)
      setError('Failed to fetch plan')
      setCurrentPlan(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch saved plans for current user
  const fetchSavedPlans = useCallback(async () => {
    try {
      const response = await fetch('/api/saved-plans')
      if (response.ok) {
        const data = await response.json()
        setSavedPlans(data.plans || [])
      }
    } catch (err) {
      console.error('Failed to fetch saved plans:', err)
    }
  }, [])

  // Load saved plans on mount
  useEffect(() => {
    fetchSavedPlans()
  }, [fetchSavedPlans])

  // Debounced plan search
  useEffect(() => {
    if (!planSearchQuery.trim()) {
      setPlanSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await fetch(`/api/plans?search=${encodeURIComponent(planSearchQuery.trim())}`)
        if (response.ok) {
          const data = await response.json()
          setPlanSearchResults(data.plans || [])
        }
      } catch (err) {
        console.error('Plan search failed:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [planSearchQuery])

  // Save current selections as a saved plan
  const handleSavePlan = async () => {
    if (!savePlanName.trim()) return
    setIsSaving(true)
    setSaveError(null)

    // Convert selectedItems Map<string, Set<string>> to Record<string, string[]>
    const selectedRecord: Record<string, string[]> = {}
    selectedItems.forEach((items, key) => {
      const arr = Array.from(items)
      if (arr.length > 0) {
        // Separate custom items from standard items
        const standard = arr.filter(i => !i.startsWith('[Custom] '))
        const custom = arr.filter(i => i.startsWith('[Custom] '))
        if (standard.length > 0) selectedRecord[key] = standard
        if (custom.length > 0) {
          if (!selectedRecord[`__custom__${key}`]) {
            selectedRecord[`__custom__${key}`] = custom
          }
        }
      }
    })

    // Build custom items from the custom items that are in selectedItems
    const customRecord: Record<string, string[]> = {}
    selectedItems.forEach((items, key) => {
      const customArr = Array.from(items).filter(i => i.startsWith('[Custom] '))
      if (customArr.length > 0) {
        customRecord[key] = customArr
      }
    })

    try {
      const response = await fetch('/api/saved-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: savePlanName.trim(),
          description: savePlanDescription.trim() || undefined,
          source_plan_key: currentPlan?.id || undefined,
          selected_items: selectedRecord,
          custom_items: customRecord,
        }),
      })

      if (response.status === 409) {
        setSaveError('Maximum of 10 saved plans reached. Delete one to save a new plan.')
        setIsSaving(false)
        return
      }

      if (!response.ok) {
        const data = await response.json()
        setSaveError(data.error || 'Failed to save plan')
        setIsSaving(false)
        return
      }

      // Success - refresh list and close dialog
      await fetchSavedPlans()
      setShowSaveDialog(false)
      setSavePlanName('')
      setSavePlanDescription('')
    } catch (err) {
      setSaveError('Failed to save plan')
    } finally {
      setIsSaving(false)
    }
  }

  // Load a saved plan — applies selections + custom items to component state
  const handleLoadPlan = async (plan: SavedPlan) => {
    // If plan has a source_plan_key and we don't have that plan loaded, load it first
    if (plan.source_plan_key && currentPlan?.id !== plan.source_plan_key) {
      // Find the plan in availablePlans and select it
      const matchingPlan = availablePlans.find(p => p.plan_id === plan.source_plan_key)
      if (matchingPlan) {
        setSelectedDiagnosisId(matchingPlan.plan_id)
        await fetchPlanForDiagnosis(matchingPlan.linked_diagnoses[0] || matchingPlan.plan_id)
      }
    }

    // Apply saved selections to state
    const newSelectedItems = new Map<string, Set<string>>()
    if (plan.selected_items) {
      Object.entries(plan.selected_items).forEach(([key, items]) => {
        if (Array.isArray(items) && !key.startsWith('__custom__')) {
          newSelectedItems.set(key, new Set(items))
        }
      })
    }

    // Merge custom items into the selected items
    if (plan.custom_items) {
      Object.entries(plan.custom_items).forEach(([key, items]) => {
        if (Array.isArray(items)) {
          const existing = newSelectedItems.get(key) || new Set()
          items.forEach(item => existing.add(item))
          newSelectedItems.set(key, existing)
        }
      })
    }

    setSelectedItems(newSelectedItems)
    setShowLoadDialog(false)

    // Track usage
    try {
      await fetch(`/api/saved-plans/${plan.id}`, { method: 'PATCH' })
      fetchSavedPlans() // refresh counts
    } catch {
      // non-critical
    }
  }

  // Delete a saved plan
  const handleDeleteSavedPlan = async (planId: string) => {
    try {
      const response = await fetch(`/api/saved-plans/${planId}`, { method: 'DELETE' })
      if (response.ok) {
        setSavedPlans(prev => prev.filter(p => p.id !== planId))
      }
    } catch (err) {
      console.error('Failed to delete saved plan:', err)
    }
  }

  // Get plan titles that match selected diagnoses ONLY
  // Plans are only shown when diagnoses are selected
  const getRelevantPlanTitles = useCallback(() => {
    // If no diagnoses selected, show nothing (require diagnosis selection first)
    if (selectedDiagnoses.length === 0) {
      return []
    }

    // Find plans that are linked to any of the selected diagnoses
    const relevantPlans = availablePlans.filter(plan =>
      plan.linked_diagnoses.some(diagId => selectedDiagnoses.includes(diagId))
    )

    // If no specific plans found for selected diagnoses, show generic fallback
    if (relevantPlans.length === 0) {
      const genericPlan = availablePlans.find(p => p.title === 'General Neurology Evaluation')
      if (genericPlan) {
        return [{ id: genericPlan.plan_id, title: genericPlan.title, diagnosisIds: [], isGeneric: true }]
      }
      return []
    }

    // Sort by max match score for the selected diagnoses (best-matching plan first)
    const scored = relevantPlans.map(plan => {
      let maxScore = 0
      if (plan.diagnosis_scores) {
        for (const diagId of selectedDiagnoses) {
          const s = plan.diagnosis_scores[diagId] || 0
          if (s > maxScore) maxScore = s
        }
      }
      return { plan, maxScore }
    })
    scored.sort((a, b) => b.maxScore - a.maxScore)

    return scored.map(({ plan }) => ({ id: plan.plan_id, title: plan.title, diagnosisIds: plan.linked_diagnoses, isGeneric: false }))
  }, [availablePlans, selectedDiagnoses])

  const planOptions = getRelevantPlanTitles()

  // Reset selections when the dropdown diagnosis changes
  useEffect(() => {
    setExpandedSections({})
    setExpandedSubsections({})
    setSelectedItems(new Map())
    setActiveReferenceTab(null)
    setActiveTooltip(null)
    setExpandedDosing(new Set())
    setCustomItems({})
  }, [selectedDiagnosisId])

  // Reset plan builder when selected diagnoses change (from parent)
  // This ensures recommendations update when diagnoses are added/removed
  useEffect(() => {
    // If the currently selected plan is no longer linked to any selected diagnosis, reset it
    if (selectedDiagnosisId) {
      const selectedPlan = availablePlans.find(p => p.plan_id === selectedDiagnosisId)
      const isStillRelevant = selectedPlan?.linked_diagnoses.some(diagId => selectedDiagnoses.includes(diagId))
      if (!isStillRelevant) {
        setSelectedDiagnosisId(null)
        setCurrentPlan(null)
        setShowPlanBuilder(false)
      }
    }
  }, [selectedDiagnoses, selectedDiagnosisId, availablePlans])

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }))
  }

  const toggleSubsection = (key: string) => {
    setExpandedSubsections(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const toggleDosing = (itemKey: string) => {
    setExpandedDosing(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey)
      } else {
        newSet.add(itemKey)
      }
      return newSet
    })
  }

  // Show tooltip on hover (replaces click-based toggle for faster clinical workflow)
  const showTooltip = (itemKey: string, type: TooltipType) => {
    setActiveTooltip({ itemKey, type })
  }

  const hideTooltip = () => {
    setActiveTooltip(null)
  }

  const handleAddCustomItem = (sectionKey: string) => {
    const itemText = customItems[sectionKey]?.trim()
    if (itemText) {
      toggleItem(sectionKey, `[Custom] ${itemText}`)
      setCustomItems(prev => ({ ...prev, [sectionKey]: '' }))
    }
  }

  // Sort sections according to canonical order (from recommendationOrdering)
  const getSortedSections = (sections: Record<string, Record<string, RecommendationItem[]>>) => {
    return sortSections(Object.keys(sections))
  }

  // Sort subsections according to canonical order for the section
  const getSortedSubsections = (sectionName: string, subsections: Record<string, RecommendationItem[]>) => {
    return sortSubsections(sectionName, Object.keys(subsections))
  }

  const toggleItem = (sectionKey: string, itemText: string) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      const sectionItems = newMap.get(sectionKey) || new Set()

      if (sectionItems.has(itemText)) {
        sectionItems.delete(itemText)
      } else {
        sectionItems.add(itemText)
      }

      newMap.set(sectionKey, sectionItems)
      return newMap
    })
  }

  // Ensure an item is selected (for when dose option is chosen)
  const selectItem = (sectionKey: string, itemText: string) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      const sectionItems = newMap.get(sectionKey) || new Set()
      sectionItems.add(itemText)
      newMap.set(sectionKey, sectionItems)
      return newMap
    })
  }

  // Select dose option AND auto-check the medication
  const selectDoseOption = (itemKey: string, orderSentence: string, sectionKey: string, itemName: string) => {
    setSelectedDoseOptions(prev => ({ ...prev, [itemKey]: orderSentence }))
    selectItem(sectionKey, itemName)
  }

  const isItemSelected = (sectionKey: string, itemText: string): boolean => {
    return selectedItems.get(sectionKey)?.has(itemText) || false
  }

  const getTotalSelectedCount = (): number => {
    let count = 0
    selectedItems.forEach(set => {
      count += set.size
    })
    return count
  }

  // Helper to get the formatted item text with dose if selected
  const getItemWithDose = (sectionKey: string, itemName: string, itemIndex: number): string => {
    const itemKey = `${sectionKey}-${itemIndex}`
    const selectedDose = selectedDoseOptions[itemKey]

    if (selectedDose && selectedDose !== 'custom') {
      // A standard dose option was selected - use the order sentence
      return selectedDose
    } else if (selectedDose === 'custom' && customDoseText[itemKey]) {
      // Custom dose was entered
      return `${itemName}: ${customDoseText[itemKey]}`
    }
    // No dose selected - just return item name
    return itemName
  }

  const handleAddSelectedToPlan = () => {
    const allSelected: string[] = []

    // Group items by section for better formatting
    const grouped = new Map<string, string[]>()
    selectedItems.forEach((items, sectionKey) => {
      // Extract the subsection name from the key (e.g., "Diagnostics-Imaging" -> "Imaging")
      const parts = sectionKey.split('-')
      const subsection = parts.length > 1 ? parts.slice(1).join('-') : parts[0]
      if (!grouped.has(subsection)) grouped.set(subsection, [])

      // Get items with their selected doses
      items.forEach(itemName => {
        // Find the item index in the current plan to look up dose selection
        if (currentPlan?.sections) {
          let foundIndex = -1
          for (const section of Object.values(currentPlan.sections)) {
            const subsectionItems = section[subsection]
            if (subsectionItems) {
              foundIndex = subsectionItems.findIndex(i => i.item === itemName)
              if (foundIndex !== -1) {
                const itemWithDose = getItemWithDose(sectionKey, itemName, foundIndex)
                grouped.get(subsection)!.push(itemWithDose)
                break
              }
            }
          }
          // If not found by subsection, just add the item name
          if (foundIndex === -1) {
            grouped.get(subsection)!.push(itemName)
          }
        } else {
          grouped.get(subsection)!.push(itemName)
        }
      })
    })

    grouped.forEach((items, subsection) => {
      allSelected.push(`${subsection}:`)
      items.forEach(item => allSelected.push(`  • ${item}`))
    })

    if (allSelected.length > 0) {
      onAddToPlan(allSelected)
      // Show confirmation
      setAddedConfirmation(true)
      setTimeout(() => setAddedConfirmation(false), 2000)
      // Clear selections after adding
      setSelectedItems(new Map())
      // Also clear dose selections
      setSelectedDoseOptions({})
      setCustomDoseText({})
    }
  }

  // Select all / deselect all for a subsection
  const toggleSelectAllSubsection = (subsectionKey: string, items: RecommendationItem[]) => {
    const validItems = items.filter(i => i.priority !== '—')
    const currentSelected = selectedItems.get(subsectionKey) || new Set<string>()
    const allSelected = validItems.every(i => currentSelected.has(i.item))

    setSelectedItems(prev => {
      const newMap = new Map(prev)
      if (allSelected) {
        // Deselect all
        newMap.delete(subsectionKey)
      } else {
        // Select all
        const newSet = new Set<string>()
        validItems.forEach(i => newSet.add(i.item))
        newMap.set(subsectionKey, newSet)
      }
      return newMap
    })
  }

  const renderPriorityBadge = (priority: string) => {
    const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS['—']
    if (priority === '—') return null

    return (
      <span
        style={{
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          marginLeft: '8px',
          flexShrink: 0,
        }}
      >
        {priority}
      </span>
    )
  }

  const renderRecommendationItem = (
    item: RecommendationItem,
    sectionKey: string,
    index: number
  ) => {
    if (item.priority === '—') return null

    const itemKey = `${sectionKey}-${index}`
    const isSelected = isItemSelected(sectionKey, item.item)
    const hasDosing = !!item.dosing
    const isDrugItem = hasDosing && (sectionKey.includes('Treatment') || sectionKey.includes('ASM') || sectionKey.includes('DMT') || sectionKey.includes('Antiplatelet') || sectionKey.includes('Anticoagulation') || sectionKey.includes('Pain') || sectionKey.includes('Rescue') || sectionKey.includes('Symptomatic'))
    const isDosingExpanded = expandedDosing.has(itemKey)

    // Collect available detail types for icon buttons
    const availableDetails: { type: TooltipType; content: string }[] = []
    if (item.rationale) availableDetails.push({ type: 'rationale', content: item.rationale })
    if (item.indication) availableDetails.push({ type: 'indication', content: item.indication })
    if (item.timing) availableDetails.push({ type: 'timing', content: item.timing })
    if (item.target) availableDetails.push({ type: 'target', content: item.target })
    if (item.contraindications) availableDetails.push({ type: 'contraindications', content: item.contraindications })
    if (item.monitoring) availableDetails.push({ type: 'monitoring', content: item.monitoring })

    return (
      <div
        key={itemKey}
        style={{
          padding: '10px 12px',
          borderRadius: '6px',
          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
          background: isSelected ? 'rgba(13, 148, 136, 0.05)' : 'var(--bg-white)',
          marginBottom: '8px',
          transition: 'all 0.15s ease',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {/* Checkbox */}
          <div
            onClick={() => toggleItem(sectionKey, item.item)}
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
              background: isSelected ? 'var(--primary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '2px',
              cursor: 'pointer',
            }}
          >
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              {/* Item name - clickable for drugs to show dosing */}
              {isDrugItem ? (
                <button
                  onClick={() => toggleDosing(itemKey)}
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textAlign: 'left',
                  }}
                >
                  {item.item}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: isDosingExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              ) : (
                <span
                  onClick={() => toggleItem(sectionKey, item.item)}
                  style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  {item.item}
                </span>
              )}
              {renderPriorityBadge(item.priority)}

              {/* Icon buttons for details - hover to show floating tooltip */}
              {availableDetails.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                  {availableDetails.map(({ type, content }) => {
                    const iconConfig = TOOLTIP_ICONS[type]
                    const isActive = activeTooltip?.itemKey === itemKey && activeTooltip?.type === type
                    return (
                      <div
                        key={type}
                        onMouseEnter={() => showTooltip(itemKey, type)}
                        onMouseLeave={hideTooltip}
                        style={{
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '4px',
                            border: 'none',
                            background: isActive ? (isDarkMode ? iconConfig.darkColor : iconConfig.color) : (isDarkMode ? iconConfig.darkBg : iconConfig.bg),
                            color: isActive ? 'white' : (isDarkMode ? iconConfig.darkColor : iconConfig.color),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'default',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {iconConfig.icon}
                        </div>
                        {/* Floating tooltip popover */}
                        {isActive && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              marginTop: '8px',
                              padding: '10px 12px',
                              background: isDarkMode ? iconConfig.darkBg : iconConfig.bg,
                              borderRadius: '6px',
                              border: `1px solid ${isDarkMode ? iconConfig.darkColor : iconConfig.color}30`,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              zIndex: 50,
                              minWidth: '200px',
                              maxWidth: '300px',
                              whiteSpace: 'normal',
                            }}
                          >
                            <div style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: isDarkMode ? iconConfig.darkColor : iconConfig.color,
                              marginBottom: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}>
                              {iconConfig.label}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                              {content}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Dosing dropdown for medications */}
            {isDrugItem && isDosingExpanded && item.dosing && (
              <div style={{
                marginTop: '8px',
                padding: '10px 12px',
                background: 'var(--bg-gray)',
                borderRadius: '6px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Order Sentence
                </div>

                {/* Check if structured dosing with multiple options */}
                {typeof item.dosing === 'object' && (item.dosing as StructuredDosing).doseOptions && (item.dosing as StructuredDosing).doseOptions!.length > 1 ? (
                  <div>
                    {/* Dose option selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(item.dosing as StructuredDosing).doseOptions!.map((opt: DoseOption, optIndex: number) => {
                        const isOptionSelected = selectedDoseOptions[itemKey] === opt.orderSentence
                        return (
                          <label
                            key={optIndex}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 10px',
                              borderRadius: '4px',
                              border: `1px solid ${isOptionSelected ? 'var(--primary)' : 'var(--border)'}`,
                              background: isOptionSelected ? 'rgba(13, 148, 136, 0.1)' : 'var(--bg-white)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <input
                              type="radio"
                              name={`dose-${itemKey}`}
                              checked={isOptionSelected}
                              onChange={() => selectDoseOption(itemKey, opt.orderSentence, sectionKey, item.item)}
                              style={{ accentColor: 'var(--primary)' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                {opt.text}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {opt.orderSentence}
                              </div>
                            </div>
                          </label>
                        )
                      })}

                      {/* Custom option */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '4px',
                          border: `1px solid ${selectedDoseOptions[itemKey] === 'custom' ? 'var(--primary)' : 'var(--border)'}`,
                          background: selectedDoseOptions[itemKey] === 'custom' ? 'rgba(13, 148, 136, 0.1)' : 'var(--bg-white)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="radio"
                          name={`dose-${itemKey}`}
                          checked={selectedDoseOptions[itemKey] === 'custom'}
                          onChange={() => selectDoseOption(itemKey, 'custom', sectionKey, item.item)}
                          style={{ accentColor: 'var(--primary)', marginTop: '4px' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                            Custom order
                          </div>
                          {selectedDoseOptions[itemKey] === 'custom' && (
                            <input
                              type="text"
                              placeholder="Enter custom order sentence..."
                              value={customDoseText[itemKey] || ''}
                              onChange={(e) => setCustomDoseText(prev => ({ ...prev, [itemKey]: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                background: 'var(--bg-white)',
                                fontSize: '12px',
                                color: 'var(--text-primary)',
                              }}
                            />
                          )}
                        </div>
                      </label>
                    </div>

                    {/* Show additional instructions if available */}
                    {(item.dosing as StructuredDosing).instructions && (
                      <div style={{
                        marginTop: '10px',
                        padding: '8px 10px',
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderRadius: '4px',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                      }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: '#7C3AED', marginBottom: '2px', textTransform: 'uppercase' }}>
                          Instructions
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
                          {(item.dosing as StructuredDosing).instructions}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Simple string dosing - show as text */
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                    {typeof item.dosing === 'string' ? item.dosing : (item.dosing as StructuredDosing).orderSentence || (item.dosing as StructuredDosing).instructions || 'See prescribing information'}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-white)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Smart Recommendations
          </span>
          <span style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 500,
            background: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
            color: 'white',
          }}>
            AI-Powered
          </span>
          {/* Legend toggle */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: showLegend ? 'var(--bg-gray)' : 'transparent',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            Legend
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Load saved plan button */}
          {savedPlans.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowLoadDialog(!showLoadDialog); setShowSaveDialog(false) }}
                title="Load saved plan"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: showLoadDialog ? 'var(--bg-gray)' : 'var(--bg-white)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                Load
              </button>

              {/* Load dialog dropdown */}
              {showLoadDialog && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  width: '320px',
                  maxHeight: '360px',
                  overflowY: 'auto',
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 50,
                  padding: '8px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                    Saved Plans ({savedPlans.length})
                  </div>
                  {savedPlans.map(sp => (
                    <div
                      key={sp.id}
                      style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        marginBottom: '4px',
                        background: 'var(--bg-gray)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{sp.name}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {sp.use_count > 0 ? `Used ${sp.use_count}×` : 'Never used'}
                        </span>
                      </div>
                      {sp.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{sp.description}</div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleDeleteSavedPlan(sp.id)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #FECACA',
                            background: '#FEF2F2',
                            color: '#DC2626',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleLoadPlan(sp)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'var(--primary)',
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save button — only shown when items are selected */}
          {getTotalSelectedCount() > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowSaveDialog(!showSaveDialog); setShowLoadDialog(false); setSaveError(null) }}
                title="Save current selections as a plan"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: showSaveDialog ? 'var(--bg-gray)' : 'var(--bg-white)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>

              {/* Save dialog */}
              {showSaveDialog && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  width: '300px',
                  background: 'var(--bg-white)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 50,
                  padding: '12px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Save Plan
                  </div>
                  <input
                    type="text"
                    placeholder="Plan name (required)"
                    value={savePlanName}
                    onChange={(e) => setSavePlanName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePlan() }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-white)',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      marginBottom: '6px',
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={savePlanDescription}
                    onChange={(e) => setSavePlanDescription(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-white)',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      marginBottom: '8px',
                      boxSizing: 'border-box',
                    }}
                  />
                  {saveError && (
                    <div style={{ fontSize: '11px', color: '#DC2626', marginBottom: '6px' }}>{saveError}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {savedPlans.length} of 10 plans
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => { setShowSaveDialog(false); setSaveError(null) }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-white)',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSavePlan}
                        disabled={!savePlanName.trim() || isSaving}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '4px',
                          border: 'none',
                          background: savePlanName.trim() ? 'var(--primary)' : 'var(--border)',
                          color: savePlanName.trim() ? 'white' : 'var(--text-muted)',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: savePlanName.trim() && !isSaving ? 'pointer' : 'not-allowed',
                          opacity: isSaving ? 0.7 : 1,
                        }}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add to Plan button */}
          {(getTotalSelectedCount() > 0 || addedConfirmation) && (
            <button
              onClick={handleAddSelectedToPlan}
              disabled={addedConfirmation}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: addedConfirmation ? '#10B981' : 'var(--primary)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 500,
                cursor: addedConfirmation ? 'default' : 'pointer',
                transition: 'background 0.3s',
              }}
            >
              {addedConfirmation ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Added!
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add {getTotalSelectedCount()} to Plan
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Legend Panel */}
      {showLegend && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Icon Legend
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {/* Priority badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingRight: '16px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>Timing:</div>
              {Object.entries(PRIORITY_COLORS).filter(([key]) => !['✓', '—'].includes(key)).map(([key, colors]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: colors.bg,
                    color: colors.text,
                  }}>
                    {key}
                  </span>
                </div>
              ))}
            </div>
            {/* Info icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>Details:</div>
              {Object.entries(TOOLTIP_ICONS).map(([key, config]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    background: config.bg,
                    color: config.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {config.icon}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{config.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Plan Search Bar — always visible */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ position: 'relative' }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search plans by name, ICD-10, or keyword..."
            value={planSearchQuery}
            onChange={(e) => setPlanSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-white)',
              fontSize: '13px',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
          {planSearchQuery && (
            <button
              onClick={() => setPlanSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: '2px',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Search results */}
        {planSearchQuery.trim() && (
          <div style={{
            marginTop: '8px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            background: 'var(--bg-white)',
            maxHeight: '200px',
            overflowY: 'auto',
          }}>
            {isSearching ? (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                Searching...
              </div>
            ) : planSearchResults.length > 0 ? (
              planSearchResults.map(plan => (
                <button
                  key={plan.plan_id}
                  onClick={() => {
                    setSelectedDiagnosisId(plan.plan_id)
                    fetchPlanByKey(plan.plan_id)
                    setPlanSearchQuery('')
                    setPlanSearchResults([])
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: selectedDiagnosisId === plan.plan_id ? 'var(--bg-gray)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>{plan.title}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px', flexShrink: 0 }}>
                    {(plan.icd10_codes || []).slice(0, 3).join(', ')}
                    {(plan.icd10_codes || []).length > 3 && '...'}
                  </span>
                </button>
              ))
            ) : (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                No plans found for &ldquo;{planSearchQuery}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>

      {/* Diagnosis/Plan Selection Buttons - Only shown when diagnoses are selected */}
      {selectedDiagnoses.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Available treatment plans for selected diagnoses:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {planOptions.length > 0 ? (
              planOptions.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => {
                    if (selectedDiagnosisId === plan.id) {
                      setSelectedDiagnosisId(null)
                      setCurrentPlan(null)
                      setShowPlanBuilder(false)
                    } else {
                      setSelectedDiagnosisId(plan.id)
                      // Fetch by plan key directly — more reliable than ICD-10 roundtrip
                      fetchPlanByKey(plan.id)
                    }
                  }}
                  disabled={isLoading}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    cursor: isLoading ? 'wait' : 'pointer',
                    border: '1px solid',
                    borderColor: selectedDiagnosisId === plan.id ? 'var(--primary)' : 'var(--border)',
                    background: selectedDiagnosisId === plan.id ? 'var(--primary)' : 'var(--bg-white)',
                    color: selectedDiagnosisId === plan.id ? 'white' : 'var(--text-secondary)',
                    fontWeight: selectedDiagnosisId === plan.id ? 500 : 400,
                    transition: 'all 0.15s ease',
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  {plan.title}
                  {plan.isGeneric && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.7 }}>(Generic)</span>
                  )}
                </button>
              ))
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {availablePlans.length === 0 ? 'Loading plans...' : 'No specific plans available for selected diagnoses'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#DC2626',
        }}>
          {error}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 8px',
          }} />
          Loading plan...
        </div>
      )}

      {/* Plan Builder */}
      {currentPlan && showPlanBuilder && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {/* Plan Header - Compact with Icon Buttons */}
          <div style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
            color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              {/* Title */}
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, flex: 1 }}>{currentPlan.title}</h3>

              {/* Icon Buttons Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* ICD-10 Codes */}
                <button
                  onClick={() => setActiveReferenceTab(activeReferenceTab === 'icd' ? null : 'icd')}
                  title={`ICD-10: ${currentPlan.icd10.join(', ')}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeReferenceTab === 'icd' ? 'white' : 'rgba(255,255,255,0.2)',
                    color: activeReferenceTab === 'icd' ? '#0D9488' : 'white',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  ICD
                </button>

                {/* Scope/Definition */}
                <button
                  onClick={() => setActiveReferenceTab(activeReferenceTab === 'scope' ? null : 'scope')}
                  title="Definition & Scope"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: activeReferenceTab === 'scope' ? 'white' : 'rgba(255,255,255,0.2)',
                    color: activeReferenceTab === 'scope' ? '#0D9488' : 'white',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  Scope
                </button>

                {/* Clinical Pearls */}
                {currentPlan.notes.length > 0 && (
                  <button
                    onClick={() => setActiveReferenceTab(activeReferenceTab === 'pearls' ? null : 'pearls')}
                    title="Clinical Pearls"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: activeReferenceTab === 'pearls' ? '#FEF3C7' : 'rgba(255,255,255,0.2)',
                      color: activeReferenceTab === 'pearls' ? '#D97706' : 'white',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    Pearls
                  </button>
                )}

                {/* Differential Diagnosis */}
                {currentPlan.differential && currentPlan.differential.length > 0 && (
                  <button
                    onClick={() => setActiveReferenceTab(activeReferenceTab === 'differential' ? null : 'differential')}
                    title="Differential Diagnosis"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: activeReferenceTab === 'differential' ? '#DBEAFE' : 'rgba(255,255,255,0.2)',
                      color: activeReferenceTab === 'differential' ? '#2563EB' : 'white',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                    DDx
                  </button>
                )}

                {/* Evidence */}
                {currentPlan.evidence && currentPlan.evidence.length > 0 && (
                  <button
                    onClick={() => setActiveReferenceTab(activeReferenceTab === 'evidence' ? null : 'evidence')}
                    title="Evidence & Guidelines"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: activeReferenceTab === 'evidence' ? '#D1FAE5' : 'rgba(255,255,255,0.2)',
                      color: activeReferenceTab === 'evidence' ? '#059669' : 'white',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                    </svg>
                    Evidence
                  </button>
                )}

                {/* Monitoring */}
                {currentPlan.monitoring && currentPlan.monitoring.length > 0 && (
                  <button
                    onClick={() => setActiveReferenceTab(activeReferenceTab === 'monitoring' ? null : 'monitoring')}
                    title="Monitoring Parameters"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: 'none',
                      background: activeReferenceTab === 'monitoring' ? '#FEE2E2' : 'rgba(255,255,255,0.2)',
                      color: activeReferenceTab === 'monitoring' ? '#DC2626' : 'white',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                    Monitor
                  </button>
                )}

                {/* Close Button */}
                <button
                  onClick={() => {
                    setSelectedDiagnosisId(null); setCurrentPlan(null)
                    setShowPlanBuilder(false)
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px',
                    cursor: 'pointer',
                    color: 'white',
                    marginLeft: '4px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Reference Content Panels */}
          {activeReferenceTab && (
            <div style={{
              padding: '12px 16px',
              background: activeReferenceTab === 'pearls' ? '#FEF3C7' : 'var(--bg-white)',
              borderBottom: '1px solid var(--border)',
              maxHeight: '250px',
              overflowY: 'auto',
            }}>
              {/* ICD-10 Codes Panel */}
              {activeReferenceTab === 'icd' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>ICD-10 Codes</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {currentPlan.icd10.map((code, index) => (
                      <span key={index} style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'var(--bg-gray)',
                        border: '1px solid var(--border)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                      }}>
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Scope/Definition Panel */}
              {activeReferenceTab === 'scope' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>Scope & Definition</span>
                  </div>
                  <div style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: 'var(--bg-gray)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                  }}>
                    {currentPlan.scope}
                  </div>
                </div>
              )}

              {/* Clinical Pearls Panel */}
              {activeReferenceTab === 'pearls' && currentPlan.notes.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#D97706' }}>Clinical Pearls</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#92400E' }}>
                    {currentPlan.notes.map((note, i) => (
                      <li key={i} style={{ marginBottom: '6px', lineHeight: 1.4 }}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Differential Diagnosis Panel */}
              {activeReferenceTab === 'differential' && currentPlan.differential && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB' }}>Differential Diagnosis</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentPlan.differential.map((ddx, index) => (
                      <div key={index} style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-gray)',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {ddx.diagnosis}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 500 }}>Features: </span>{ddx.features}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 500 }}>Tests: </span>{ddx.tests}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Panel */}
              {activeReferenceTab === 'evidence' && currentPlan.evidence && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                      <path d="M8 7h8M8 11h8M8 15h4" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>Evidence & Guidelines</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentPlan.evidence.map((ev, index) => (
                      <div key={index} style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-gray)',
                      }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '6px' }}>
                          {ev.recommendation}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 600,
                            background: '#D1FAE5',
                            color: '#059669',
                          }}>
                            {ev.evidenceLevel}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {ev.source}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monitoring Panel */}
              {activeReferenceTab === 'monitoring' && currentPlan.monitoring && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>Monitoring Parameters</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {currentPlan.monitoring.map((mon, index) => (
                      <div key={index} style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-gray)',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {mon.item}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                          <div>
                            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Frequency: </span>
                            <span style={{ color: 'var(--text-muted)' }}>{mon.frequency}</span>
                          </div>
                          <div>
                            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Action: </span>
                            <span style={{ color: 'var(--text-muted)' }}>{mon.action}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sections */}
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {getSortedSections(currentPlan.sections).map((sectionName) => {
              const subsections = currentPlan.sections[sectionName]
              return (
              <div key={sectionName} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(sectionName)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: expandedSections[sectionName] ? 'var(--bg-gray)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: sectionName.includes('Lab') ? '#8B5CF6' : sectionName.includes('Imaging') ? '#0891B2' : sectionName.includes('Treatment') ? '#059669' : 'var(--primary)',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {sectionName}
                    </span>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedSections[sectionName] ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Section Content */}
                {expandedSections[sectionName] && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {getSortedSubsections(sectionName, subsections).map((subsectionName) => {
                      const items = subsections[subsectionName]
                      const subsectionKey = `${sectionName}-${subsectionName}`
                      const hasValidItems = items.some(item => item.priority !== '—')

                      if (!hasValidItems) return null

                      return (
                        <div key={subsectionKey} style={{ marginBottom: '12px' }}>
                          {/* Subsection Header */}
                          <button
                            onClick={() => toggleSubsection(subsectionKey)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'var(--bg-dark)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              marginBottom: expandedSubsections[subsectionKey] ? '8px' : '0',
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                              {subsectionName}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {expandedSubsections[subsectionKey] && (
                                <span
                                  onClick={(e) => { e.stopPropagation(); toggleSelectAllSubsection(subsectionKey, items) }}
                                  style={{
                                    fontSize: '11px', color: 'var(--primary)', cursor: 'pointer',
                                    padding: '2px 6px', borderRadius: '4px', background: 'rgba(13, 148, 136, 0.08)',
                                  }}
                                >
                                  {items.filter(i => i.priority !== '—').every(i => (selectedItems.get(subsectionKey) || new Set()).has(i.item)) ? 'Deselect all' : 'Select all'}
                                </span>
                              )}
                              <span style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-white)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}>
                                {items.filter(i => i.priority !== '—').length} items
                              </span>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                style={{
                                  transform: expandedSubsections[subsectionKey] ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </button>

                          {/* Items */}
                          {expandedSubsections[subsectionKey] && (
                            <div style={{ paddingLeft: '8px' }}>
                              {items.map((item, index) =>
                                renderRecommendationItem(item, subsectionKey, index)
                              )}

                              {/* Custom item input */}
                              <div style={{
                                display: 'flex',
                                gap: '8px',
                                marginTop: '8px',
                                padding: '8px',
                                background: 'var(--bg-gray)',
                                borderRadius: '6px',
                                border: '1px dashed var(--border)',
                              }}>
                                <input
                                  type="text"
                                  placeholder="Add custom item..."
                                  value={customItems[subsectionKey] || ''}
                                  onChange={(e) => setCustomItems(prev => ({ ...prev, [subsectionKey]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleAddCustomItem(subsectionKey)
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '6px 10px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-white)',
                                    fontSize: '12px',
                                    color: 'var(--text-primary)',
                                  }}
                                />
                                <button
                                  onClick={() => handleAddCustomItem(subsectionKey)}
                                  disabled={!customItems[subsectionKey]?.trim()}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: customItems[subsectionKey]?.trim() ? 'var(--primary)' : 'var(--border)',
                                    color: customItems[subsectionKey]?.trim() ? 'white' : 'var(--text-muted)',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    cursor: customItems[subsectionKey]?.trim() ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  + Add
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )})}

            {/* Patient Instructions Section */}
            {currentPlan.patientInstructions.length > 0 && (
              <div style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => toggleSection('Patient Instructions')}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: expandedSections['Patient Instructions'] ? 'var(--bg-gray)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#8B5CF6',
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Patient Instructions
                    </span>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                      transform: expandedSections['Patient Instructions'] ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {expandedSections['Patient Instructions'] && (
                  <div style={{ padding: '0 16px 16px' }}>
                    {currentPlan.patientInstructions.map((instruction, index) => {
                      const isSelected = isItemSelected('patient-instructions', instruction)
                      return (
                        <div
                          key={index}
                          onClick={() => toggleItem('patient-instructions', instruction)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? '#8B5CF6' : 'var(--border)'}`,
                            background: isSelected ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-white)',
                            marginBottom: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                          }}
                        >
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: `2px solid ${isSelected ? '#8B5CF6' : 'var(--border)'}`,
                              background: isSelected ? '#8B5CF6' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          >
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                            {instruction}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer with selection summary */}
          {getTotalSelectedCount() > 0 && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-gray)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {getTotalSelectedCount()} item{getTotalSelectedCount() !== 1 ? 's' : ''} selected
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setSelectedItems(new Map())}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={handleAddSelectedToPlan}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--primary)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Add to Plan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state - shown when no diagnoses selected from Differential Diagnosis section */}
      {selectedDiagnoses.length === 0 && !isLoading && (
        <div style={{
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.5 }}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
          </svg>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
            Add a Diagnosis First
          </div>
          <div style={{ fontSize: '13px' }}>
            Select diagnoses in the Differential Diagnosis section above to see available treatment plans
          </div>
        </div>
      )}

      {/* Empty state - shown when diagnoses selected but no plan chosen yet */}
      {selectedDiagnoses.length > 0 && !selectedDiagnosisId && !isLoading && planOptions.length > 0 && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-gray)',
          borderRadius: '8px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.7 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <div style={{ fontSize: '13px' }}>
            Select a plan above to view evidence-based recommendations
          </div>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
