'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  CONSULT_CATEGORIES,
  derivePrimaryCategoriesFromSubOptions,
  getCategoryById,
  type ConsultCategory,
} from '@/lib/reasonForConsultData'

interface ReasonForConsultSectionProps {
  selectedSubOptions: string[]
  onSubOptionsChange: (subOptions: string[]) => void
  otherDetails?: string
  onOtherDetailsChange?: (details: string) => void
}

export default function ReasonForConsultSection({
  selectedSubOptions,
  onSubOptionsChange,
  otherDetails = '',
  onOtherDetailsChange,
}: ReasonForConsultSectionProps) {
  // Derive selected primary categories from existing sub-options (backward compatibility)
  const derivedCategories = useMemo(
    () => derivePrimaryCategoriesFromSubOptions(selectedSubOptions),
    [selectedSubOptions]
  )

  // Track which primary categories are selected
  const [selectedCategories, setSelectedCategories] = useState<string[]>(derivedCategories)

  // Track which category detail sections are expanded to show all options
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  // Track custom entries per category
  const [customEntries, setCustomEntries] = useState<Record<string, string[]>>({})
  const [customInputValues, setCustomInputValues] = useState<Record<string, string>>({})

  // Sync derived categories when sub-options change externally
  useEffect(() => {
    const derived = derivePrimaryCategoriesFromSubOptions(selectedSubOptions)
    // Only add categories that aren't already selected (don't remove user's category selections)
    setSelectedCategories(prev => {
      const newCategories = derived.filter(d => !prev.includes(d))
      if (newCategories.length > 0) {
        return [...prev, ...newCategories]
      }
      return prev
    })
  }, [selectedSubOptions])

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        // Deselecting category - also remove its sub-options
        const category = getCategoryById(categoryId)
        if (category) {
          const categorySubOptions = [...category.subOptions.common, ...category.subOptions.expanded]
          const customForCategory = customEntries[categoryId] || []
          const allCategoryOptions = [...categorySubOptions, ...customForCategory]
          const newSubOptions = selectedSubOptions.filter(opt => !allCategoryOptions.includes(opt))
          onSubOptionsChange(newSubOptions)
        }
        return prev.filter(id => id !== categoryId)
      } else {
        return [...prev, categoryId]
      }
    })
  }

  const toggleSubOption = (option: string) => {
    if (selectedSubOptions.includes(option)) {
      onSubOptionsChange(selectedSubOptions.filter(o => o !== option))
    } else {
      onSubOptionsChange([...selectedSubOptions, option])
    }
  }

  const toggleExpandSection = (categoryId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }))
  }

  const handleAddCustom = (categoryId: string) => {
    const value = customInputValues[categoryId]?.trim()
    if (!value) return

    // Add to custom entries for this category
    setCustomEntries(prev => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] || []), value],
    }))

    // Also select it
    onSubOptionsChange([...selectedSubOptions, value])

    // Clear input
    setCustomInputValues(prev => ({
      ...prev,
      [categoryId]: '',
    }))
  }

  return (
    <div style={{ position: 'relative', marginBottom: '16px' }}>
      <span
        style={{
          position: 'absolute',
          right: '-12px',
          top: '0',
          background: '#EF4444',
          color: 'white',
          fontSize: '11px',
          fontWeight: 500,
          padding: '4px 8px',
          borderRadius: '0 4px 4px 0',
          zIndex: 1,
        }}
      >
        Required
      </span>
      <div
        style={{
          background: 'var(--bg-white)',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Reason for consult
          </span>
          <span style={{ color: '#EF4444', marginLeft: '2px' }}>*</span>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Select the reason for the consult.
          </p>
        </div>

        {/* Primary Category Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          {CONSULT_CATEGORIES.map(category => {
            const isSelected = selectedCategories.includes(category.id)
            return (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1.5px solid',
                  borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  background: isSelected ? 'rgba(13, 148, 136, 0.08)' : 'var(--bg-white)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{category.icon}</span>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                    textAlign: 'left',
                    lineHeight: 1.2,
                  }}
                >
                  {category.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* Divider - only show if categories are selected */}
        {selectedCategories.length > 0 && (
          <div
            style={{
              height: '1px',
              background: 'var(--border)',
              margin: '0 -20px 20px -20px',
            }}
          />
        )}

        {/* Sub-option sections for each selected category */}
        {selectedCategories.map(categoryId => {
          const category = getCategoryById(categoryId)
          if (!category) return null

          const isExpanded = expandedSections[categoryId]
          const customForCategory = customEntries[categoryId] || []
          const visibleOptions = isExpanded
            ? [...category.subOptions.common, ...category.subOptions.expanded, ...customForCategory]
            : [...category.subOptions.common, ...customForCategory]

          return (
            <SubOptionSection
              key={categoryId}
              category={category}
              visibleOptions={visibleOptions}
              selectedSubOptions={selectedSubOptions}
              isExpanded={isExpanded}
              customInputValue={customInputValues[categoryId] || ''}
              onToggleOption={toggleSubOption}
              onToggleExpand={() => toggleExpandSection(categoryId)}
              onCustomInputChange={value =>
                setCustomInputValues(prev => ({ ...prev, [categoryId]: value }))
              }
              onAddCustom={() => handleAddCustom(categoryId)}
              hasExpandedOptions={category.subOptions.expanded.length > 0}
            />
          )
        })}

        {/* Other details free text */}
        {selectedCategories.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '8px',
              }}
            >
              Other details (optional):
            </label>
            <textarea
              value={otherDetails}
              onChange={e => onOtherDetailsChange?.(e.target.value)}
              placeholder="Additional context or details..."
              style={{
                width: '100%',
                minHeight: '60px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-component for each category's sub-options
interface SubOptionSectionProps {
  category: ConsultCategory
  visibleOptions: string[]
  selectedSubOptions: string[]
  isExpanded: boolean
  customInputValue: string
  onToggleOption: (option: string) => void
  onToggleExpand: () => void
  onCustomInputChange: (value: string) => void
  onAddCustom: () => void
  hasExpandedOptions: boolean
}

function SubOptionSection({
  category,
  visibleOptions,
  selectedSubOptions,
  isExpanded,
  customInputValue,
  onToggleOption,
  onToggleExpand,
  onCustomInputChange,
  onAddCustom,
  hasExpandedOptions,
}: SubOptionSectionProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <span style={{ fontSize: '20px' }}>{category.icon}</span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {category.label} details
        </span>
      </div>

      {/* Checkbox options */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        {visibleOptions.map(option => {
          const isChecked = selectedSubOptions.includes(option)
          return (
            <label
              key={option}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: isChecked ? 'var(--primary)' : 'var(--border)',
                background: isChecked ? 'rgba(13, 148, 136, 0.08)' : 'transparent',
                cursor: 'pointer',
                fontSize: '13px',
                color: isChecked ? 'var(--primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleOption(option)}
                style={{
                  width: '14px',
                  height: '14px',
                  accentColor: 'var(--primary)',
                  cursor: 'pointer',
                }}
              />
              {option}
            </label>
          )
        })}
      </div>

      {/* Show all / Show common + Add custom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {hasExpandedOptions && (
          <button
            onClick={onToggleExpand}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
            }}
          >
            {isExpanded ? 'Show common' : 'Show all'}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        {/* Add custom inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="text"
            value={customInputValue}
            onChange={e => onCustomInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAddCustom()
              }
            }}
            placeholder="Add custom..."
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '12px',
              width: '140px',
              background: 'var(--bg-secondary)',
            }}
          />
          <button
            onClick={onAddCustom}
            disabled={!customInputValue.trim()}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: customInputValue.trim() ? 'pointer' : 'not-allowed',
              border: '1px solid var(--border)',
              background: customInputValue.trim() ? 'var(--primary)' : 'transparent',
              color: customInputValue.trim() ? 'white' : 'var(--text-tertiary)',
              opacity: customInputValue.trim() ? 1 : 0.5,
            }}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  )
}
