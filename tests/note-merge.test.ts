/**
 * Note Merge Engine Tests
 * Tests the local merge engine with various input combinations
 */

import { describe, it, expect } from 'vitest'
import {
  mergeNoteContent,
  generateFormattedNote,
  flattenMergedNote,
  getMergeStats,
  updateFormattedNoteSection,
  verifySectionInNote,
  areRequiredSectionsVerified,
} from '@/lib/note-merge'
import type { FormattedNote } from '@/lib/note-merge/types'
import {
  manualData,
  chartPrepData,
  visitAIData,
  comprehensiveData,
  manualOnlyData,
  chartPrepOnlyData,
  visitAIOnlyData,
  markerContaminatedData,
  conflictingChartPrep,
  conflictingVisitAI,
} from './fixtures/migraine-new-consult'

// ==========================================
// mergeNoteContent() Tests
// ==========================================

describe('mergeNoteContent', () => {
  describe('with manual data only', () => {
    it('should return manual content in all fields', () => {
      const result = mergeNoteContent(manualData, null, null)

      expect(result.chiefComplaint.content).toBe('Chronic migraines with increasing frequency')
      expect(result.chiefComplaint.source).toBe('manual')
      expect(result.hpi.content).toContain('worsening headaches')
      expect(result.hpi.source).toBe('manual')
      expect(result.assessment.content).toContain('Chronic migraine without aura')
      expect(result.assessment.source).toBe('manual')
      expect(result.plan.content).toBe('Consider preventive therapy')
      expect(result.plan.source).toBe('manual')
    })

    it('should have no AI suggestions', () => {
      const result = mergeNoteContent(manualData, null, null)

      expect(result.hpi.aiSuggestion).toBeUndefined()
      expect(result.assessment.aiSuggestion).toBeUndefined()
      expect(result.plan.aiSuggestion).toBeUndefined()
    })
  })

  describe('with chart prep only', () => {
    it('should use chart prep content for fields without manual data', () => {
      const emptyManual = { chiefComplaint: '', hpi: '', ros: '', physicalExam: '', assessment: '', plan: '' }
      const result = mergeNoteContent(emptyManual, chartPrepData, null)

      expect(result.hpi.content).toContain('18-year migraine history')
      expect(result.hpi.source).toBe('chart-prep')
      expect(result.assessment.content).toContain('Chronic migraine without aura')
      expect(result.assessment.source).toBe('chart-prep')
    })

    it('should show chart prep as AI suggestion when manual data exists', () => {
      const result = mergeNoteContent(manualData, chartPrepData, null)

      // Manual data takes precedence (keep-manual default)
      expect(result.hpi.source).toBe('manual')
      expect(result.hpi.content).toContain('worsening headaches')
      // Chart prep should be offered as suggestion
      expect(result.hpi.aiSuggestion).toContain('18-year migraine history')
      expect(result.hpi.aiSuggestionSource).toBe('chart-prep')
    })
  })

  describe('with visit AI only', () => {
    it('should use visit AI content for empty fields', () => {
      const emptyManual = { chiefComplaint: '', hpi: '', ros: '', physicalExam: '', assessment: '', plan: '' }
      const result = mergeNoteContent(emptyManual, null, visitAIData)

      expect(result.hpi.content).toContain('bilateral')
      expect(result.hpi.source).toBe('visit-ai')
      expect(result.physicalExam.content).toContain('Alert, well-appearing')
      expect(result.physicalExam.source).toBe('visit-ai')
      expect(result.ros.content).toContain('Constitutional')
      expect(result.ros.source).toBe('visit-ai')
    })

    it('should prefer visit AI over manual for empty fields', () => {
      const emptyManual = { chiefComplaint: 'Migraines', hpi: '', ros: '', physicalExam: '', assessment: '', plan: '' }
      const result = mergeNoteContent(emptyManual, null, visitAIData)

      expect(result.hpi.source).toBe('visit-ai')
      expect(result.hpi.content).toContain('bilateral')
    })
  })

  describe('with all three sources', () => {
    it('should prefer manual data when present (keep-manual default)', () => {
      const result = mergeNoteContent(manualData, chartPrepData, visitAIData)

      // Manual should be primary content where it exists
      expect(result.hpi.source).toBe('manual')
      expect(result.hpi.content).toContain('worsening headaches')
    })

    it('should use visit AI for exam when manual is empty', () => {
      const result = mergeNoteContent(manualData, chartPrepData, visitAIData)

      // physicalExam is empty in manualData, visit AI should fill it
      expect(result.physicalExam.content).toContain('Alert, well-appearing')
      expect(result.physicalExam.source).toBe('visit-ai')
    })

    it('should offer AI suggestions for fields with manual content', () => {
      const result = mergeNoteContent(manualData, chartPrepData, visitAIData)

      // HPI has all three sources — manual wins, visit AI suggestion should be offered
      expect(result.hpi.aiSuggestion).toBeDefined()
    })

    it('should merge all six standard fields', () => {
      const result = mergeNoteContent(manualData, chartPrepData, visitAIData)

      const fieldNames = ['chiefComplaint', 'hpi', 'ros', 'physicalExam', 'assessment', 'plan']
      for (const field of fieldNames) {
        expect(result[field]).toBeDefined()
        expect(result[field].content).toBeDefined()
        expect(result[field].source).toBeDefined()
        expect(result[field].lastModified).toBeDefined()
      }
    })
  })

  describe('with prefer-ai conflict resolution', () => {
    it('should still keep manual when prefer-ai is set (current implementation keeps manual)', () => {
      const result = mergeNoteContent(manualData, chartPrepData, visitAIData, {
        conflictResolution: 'prefer-ai',
      })

      // Current mergeField implementation always keeps manual when it exists
      // The prefer-ai option is defined in types but not yet implemented in mergeField
      expect(result.hpi.source).toBe('manual')
      expect(result.hpi.aiSuggestion).toBeDefined()
    })
  })

  describe('with conflicting data', () => {
    it('should keep manual content as primary by default', () => {
      const manualWithLaterality = {
        ...manualData,
        hpi: 'Patient reports bilateral headaches.',
      }
      const result = mergeNoteContent(manualWithLaterality, conflictingChartPrep, conflictingVisitAI)

      expect(result.hpi.source).toBe('manual')
      expect(result.hpi.content).toContain('bilateral')
    })
  })
})

// ==========================================
// generateFormattedNote() Tests
// ==========================================

describe('generateFormattedNote', () => {
  it('should generate a formatted note with all sections', () => {
    const note = generateFormattedNote(comprehensiveData)

    expect(note).toBeDefined()
    expect(note.sections).toBeInstanceOf(Array)
    expect(note.sections.length).toBeGreaterThan(0)
    expect(note.header).toBeDefined()
    expect(note.fullText).toBeDefined()
    expect(note.wordCount).toBeGreaterThan(0)
    expect(note.generatedAt).toBeDefined()
  })

  it('should include all standard clinical sections', () => {
    const note = generateFormattedNote(comprehensiveData)

    const sectionIds = note.sections.map(s => s.id)
    expect(sectionIds).toContain('chiefComplaint')
    expect(sectionIds).toContain('hpi')
    expect(sectionIds).toContain('ros')
    expect(sectionIds).toContain('physicalExam')
    expect(sectionIds).toContain('assessment')
    expect(sectionIds).toContain('plan')
  })

  it('should include scales when data is provided', () => {
    const note = generateFormattedNote(comprehensiveData, { includeScales: true })

    const scalesSection = note.sections.find(s => s.id === 'scales')
    expect(scalesSection).toBeDefined()
    expect(scalesSection?.content).toContain('PHQ-9')
    expect(scalesSection?.content).toContain('MIDAS')
  })

  it('should include imaging when data is provided', () => {
    const note = generateFormattedNote(comprehensiveData, { includeImaging: true })

    const imagingSection = note.sections.find(s => s.id === 'imaging')
    expect(imagingSection).toBeDefined()
    expect(imagingSection?.content).toContain('MRI Brain')
  })

  it('should include diagnoses in assessment', () => {
    const note = generateFormattedNote(comprehensiveData)

    const assessmentSection = note.sections.find(s => s.id === 'assessment')
    expect(assessmentSection).toBeDefined()
    // Assessment should mention the diagnoses
    expect(assessmentSection?.content).toBeTruthy()
  })

  it('should include patient info in header', () => {
    const note = generateFormattedNote(comprehensiveData)

    expect(note.header).toContain('Sarah Chen')
  })

  it('should handle manual-only data', () => {
    const note = generateFormattedNote(manualOnlyData)

    expect(note).toBeDefined()
    expect(note.sections.length).toBeGreaterThan(0)
    const hpi = note.sections.find(s => s.id === 'hpi')
    expect(hpi?.content).toContain('worsening headaches')
    expect(hpi?.source).toBe('manual')
  })

  it('should handle chart-prep-only data', () => {
    const note = generateFormattedNote(chartPrepOnlyData)

    expect(note).toBeDefined()
    const hpi = note.sections.find(s => s.id === 'hpi')
    expect(hpi?.content).toContain('18-year migraine history')
    expect(hpi?.source).toBe('chart-prep')
  })

  it('should handle visit-AI-only data', () => {
    const note = generateFormattedNote(visitAIOnlyData)

    expect(note).toBeDefined()
    const hpi = note.sections.find(s => s.id === 'hpi')
    expect(hpi?.content).toContain('bilateral')
    expect(hpi?.source).toBe('visit-ai')
  })

  it('should exclude scales when preference is false', () => {
    const note = generateFormattedNote(comprehensiveData, { includeScales: false })

    const scalesSection = note.sections.find(s => s.id === 'scales')
    expect(scalesSection).toBeUndefined()
  })

  it('should exclude imaging when preference is false', () => {
    const note = generateFormattedNote(comprehensiveData, { includeImaging: false })

    const imagingSection = note.sections.find(s => s.id === 'imaging')
    expect(imagingSection).toBeUndefined()
  })

  it('should have sections in correct clinical order', () => {
    const note = generateFormattedNote(comprehensiveData)

    const sortedSections = [...note.sections].sort((a, b) => a.order - b.order)
    const ids = sortedSections.map(s => s.id)

    // Chief complaint should come before HPI
    const ccIdx = ids.indexOf('chiefComplaint')
    const hpiIdx = ids.indexOf('hpi')
    expect(ccIdx).toBeLessThan(hpiIdx)

    // Assessment should come before plan
    const assessIdx = ids.indexOf('assessment')
    const planIdx = ids.indexOf('plan')
    if (assessIdx >= 0 && planIdx >= 0) {
      expect(assessIdx).toBeLessThan(planIdx)
    }
  })

  it('should generate non-empty fullText', () => {
    const note = generateFormattedNote(comprehensiveData)

    expect(note.fullText.length).toBeGreaterThan(100)
    expect(note.fullText).toContain('Sarah Chen')
  })
})

// ==========================================
// flattenMergedNote() Tests
// ==========================================

describe('flattenMergedNote', () => {
  it('should convert merged note to simple string record', () => {
    const merged = mergeNoteContent(manualData, chartPrepData, visitAIData)
    const flat = flattenMergedNote(merged)

    expect(flat).toBeTypeOf('object')
    expect(typeof flat.chiefComplaint).toBe('string')
    expect(typeof flat.hpi).toBe('string')
    expect(typeof flat.assessment).toBe('string')
    expect(flat.hpi).toContain('worsening headaches')
  })
})

// ==========================================
// getMergeStats() Tests
// ==========================================

describe('getMergeStats', () => {
  it('should report correct source counts for all-manual', () => {
    const merged = mergeNoteContent(manualData, null, null)
    const stats = getMergeStats(merged)

    expect(stats.manualFields).toBeGreaterThan(0)
    expect(stats.aiFilledFields).toBe(0)
    expect(stats.totalFields).toBe(6) // 6 standard fields
  })

  it('should report mixed sources when all three are present', () => {
    const merged = mergeNoteContent(manualData, chartPrepData, visitAIData)
    const stats = getMergeStats(merged)

    // Should have manual fields (where manual data existed) and AI-filled fields (e.g., physicalExam from visit AI)
    expect(stats.manualFields).toBeGreaterThan(0)
    expect(stats.aiFilledFields).toBeGreaterThan(0)
    expect(stats.totalFields).toBe(6) // 6 standard fields
    // Fields with manual content should have AI suggestions pending
    expect(stats.fieldsWithSuggestions).toBeGreaterThan(0)
  })

  it('should report all AI-filled when no manual content', () => {
    const emptyManual = { chiefComplaint: '', hpi: '', ros: '', physicalExam: '', assessment: '', plan: '' }
    const merged = mergeNoteContent(emptyManual, chartPrepData, visitAIData)
    const stats = getMergeStats(merged)

    expect(stats.manualFields).toBe(0)
    expect(stats.aiFilledFields).toBeGreaterThan(0)
  })
})

// ==========================================
// Section editing and verification Tests
// ==========================================

describe('updateFormattedNoteSection', () => {
  it('should update a section content', () => {
    const note = generateFormattedNote(comprehensiveData)
    const updated = updateFormattedNoteSection(note, 'hpi', 'Updated HPI content here')

    const hpi = updated.sections.find(s => s.id === 'hpi')
    expect(hpi?.content).toBe('Updated HPI content here')
  })

  it('should preserve other sections when updating one', () => {
    const note = generateFormattedNote(comprehensiveData)
    const originalAssessment = note.sections.find(s => s.id === 'assessment')?.content
    const updated = updateFormattedNoteSection(note, 'hpi', 'Updated HPI')

    const assessment = updated.sections.find(s => s.id === 'assessment')
    expect(assessment?.content).toBe(originalAssessment)
  })
})

describe('verifySectionInNote', () => {
  it('should mark a section as verified', () => {
    const note = generateFormattedNote(comprehensiveData)
    const verified = verifySectionInNote(note, 'hpi', true)

    const hpi = verified.sections.find(s => s.id === 'hpi')
    expect(hpi?.isVerified).toBe(true)
  })

  it('should unverify a section', () => {
    const note = generateFormattedNote(comprehensiveData)
    const verified = verifySectionInNote(note, 'hpi', true)
    const unverified = verifySectionInNote(verified, 'hpi', false)

    const hpi = unverified.sections.find(s => s.id === 'hpi')
    expect(hpi?.isVerified).toBe(false)
  })
})

describe('areRequiredSectionsVerified', () => {
  it('should return false when no sections are verified', () => {
    const note = generateFormattedNote(comprehensiveData)

    expect(areRequiredSectionsVerified(note)).toBe(false)
  })

  it('should return true when all required sections are verified', () => {
    let note = generateFormattedNote(comprehensiveData)

    // Verify all sections that have content
    for (const section of note.sections) {
      if (section.content) {
        note = verifySectionInNote(note, section.id, true)
      }
    }

    expect(areRequiredSectionsVerified(note)).toBe(true)
  })
})

// ==========================================
// Edge cases
// ==========================================

describe('edge cases', () => {
  it('should handle completely empty manual data', () => {
    const emptyManual = {
      chiefComplaint: '',
      hpi: '',
      ros: '',
      physicalExam: '',
      assessment: '',
      plan: '',
    }
    const result = mergeNoteContent(emptyManual, null, null)

    expect(result.chiefComplaint.content).toBe('')
    expect(result.hpi.content).toBe('')
  })

  it('should handle undefined fields in manual data', () => {
    const sparseManual = {
      chiefComplaint: 'Headaches',
    }
    const result = mergeNoteContent(sparseManual, null, null)

    expect(result.chiefComplaint.content).toBe('Headaches')
    expect(result.hpi.content).toBeDefined()
  })

  it('should handle array chief complaint', () => {
    const arrayCC = {
      chiefComplaint: ['Migraines', 'Neck pain'],
      hpi: 'Test',
    }
    const result = mergeNoteContent(arrayCC, null, null)

    // Should handle array format
    expect(result.chiefComplaint.content).toBeDefined()
  })

  it('should generate note with empty comprehensive data', () => {
    const emptyData: ComprehensiveNoteData = {
      manualData: {
        chiefComplaint: '',
        hpi: '',
        ros: '',
        physicalExam: '',
        assessment: '',
        plan: '',
      },
    } as ComprehensiveNoteData

    const note = generateFormattedNote(emptyData)
    expect(note).toBeDefined()
    expect(note.sections).toBeInstanceOf(Array)
  })
})
