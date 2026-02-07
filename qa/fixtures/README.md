# QA Test Fixtures

This directory contains test fixtures for automated and semi-automated QA testing.

## Directory Structure

```
qa/fixtures/
├── audio/                      # Pre-recorded audio files for transcription tests
│   ├── simple-sentence.wav     # Simple dictation test
│   ├── chart-prep-sample.wav   # Chart prep dictation
│   ├── visit-sample.wav        # Full visit recording
│   ├── corrections.wav         # Verbal corrections test
│   └── safari-format.m4a       # Safari/iOS format test
├── expected-outputs/           # Expected transcription/extraction results
│   ├── simple-sentence.json
│   ├── chart-prep-sample.json
│   └── visit-sample.json
└── README.md                   # This file
```

## Audio Fixtures

### How to Create Test Audio Files

#### Option 1: Manual Recording (Recommended for initial setup)

1. Use QuickTime Player or any audio recorder
2. Speak the exact script below
3. Save as WAV or M4A format
4. Place in `audio/` directory

#### Option 2: Text-to-Speech (For CI automation)

```bash
# macOS (built-in say command)
say -o audio/simple-sentence.aiff "The patient reports headaches for two weeks"
ffmpeg -i audio/simple-sentence.aiff audio/simple-sentence.wav

# Or use a TTS API
```

#### Option 3: Use the Recording Script

```bash
# From project root
npm run qa:record-fixtures
```

---

## Test Audio Scripts

### simple-sentence.wav
**Duration:** ~3 seconds
**Script:** "The patient reports headaches for two weeks."
**Expected output:** "The patient reports headaches for two weeks."

### chart-prep-sample.wav
**Duration:** ~30 seconds
**Script:**
```
Reviewing the referral for this patient. 52-year-old female referred for new onset
headaches starting about three weeks ago. Located on the right side, described as
throbbing, severity 7 out of 10. Associated with nausea and light sensitivity.
No prior history of migraines. Previous workup included CT head which was normal.
She's currently taking ibuprofen with minimal relief. Alert: patient reports
recent weight loss of 10 pounds.
```

**Expected Chart Prep sections:**
- summary: Brief patient overview
- alerts: Weight loss of 10 pounds (red flag)
- suggestedHPI: Formatted HPI text

### visit-sample.wav
**Duration:** ~2 minutes
**Script:** (Full visit conversation - see visit-script.md)

**Expected Visit AI sections:**
- hpiFromVisit: Patient symptoms and timeline
- rosFromVisit: Review of systems
- examFromVisit: Physical exam findings
- assessmentFromVisit: Clinical impression
- planFromVisit: Treatment plan

### corrections.wav
**Duration:** ~5 seconds
**Script:** "The pain is in the left hand, no wait, the right hand."
**Expected output:** "The pain is in the right hand."

### safari-format.m4a
**Duration:** ~3 seconds
**Script:** "Testing transcription on Safari iOS."
**Expected output:** "Testing transcription on Safari iOS."
**Purpose:** Verify Safari/iOS audio format handling

---

## Expected Output Format

Each audio fixture should have a corresponding JSON file in `expected-outputs/`:

```json
{
  "fixture": "simple-sentence.wav",
  "expectedText": "The patient reports headaches for two weeks.",
  "allowedVariations": [
    "The patient reports headaches for 2 weeks.",
    "Patient reports headaches for two weeks."
  ],
  "audioFormat": "wav",
  "duration_seconds": 3,
  "testCases": ["FD1", "FD2", "VA9"]
}
```

### For Chart Prep fixtures:

```json
{
  "fixture": "chart-prep-sample.wav",
  "expectedText": "Reviewing the referral for this patient...",
  "expectedSections": {
    "summary": "contains: 52-year-old female, headaches, 3 weeks",
    "alerts": ["weight loss"],
    "suggestedHPI": "contains: right-sided, throbbing, 7/10"
  },
  "duration_seconds": 30,
  "testCases": ["CP1", "CP3", "B4", "B5"]
}
```

### For Visit AI fixtures:

```json
{
  "fixture": "visit-sample.wav",
  "expectedSections": {
    "hpiFromVisit": "contains: chief complaint, timeline, severity",
    "rosFromVisit": "contains: positive and negative findings",
    "examFromVisit": "contains: neurological exam findings",
    "assessmentFromVisit": "contains: clinical impression",
    "planFromVisit": "contains: next steps, medications"
  },
  "minConfidence": {
    "hpi": 0.7,
    "ros": 0.5,
    "exam": 0.7,
    "assessment": 0.6,
    "plan": 0.6
  },
  "duration_seconds": 120,
  "testCases": ["VA1", "VA3", "VA4", "VA7"]
}
```

---

## Usage in Tests

### Jest Unit Test Example

```typescript
import * as fs from 'fs'
import * as path from 'path'

describe('Transcription API', () => {
  it('transcribes simple sentence correctly', async () => {
    const audioPath = path.join(__dirname, '../../qa/fixtures/audio/simple-sentence.wav')
    const expectedPath = path.join(__dirname, '../../qa/fixtures/expected-outputs/simple-sentence.json')

    const audioBlob = new Blob([fs.readFileSync(audioPath)], { type: 'audio/wav' })
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'))

    const formData = new FormData()
    formData.append('audio', audioBlob, 'test.wav')

    const response = await fetch('/api/ai/transcribe', {
      method: 'POST',
      body: formData
    })

    const result = await response.json()

    // Exact match or allowed variation
    const matches = [expected.expectedText, ...expected.allowedVariations]
    expect(matches.some(m => result.text.includes(m) || m.includes(result.text))).toBe(true)
  })
})
```

### Playwright E2E Test Example

```typescript
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

test('Chart Prep processes audio fixture correctly', async ({ page }) => {
  const audioPath = path.join(__dirname, '../qa/fixtures/audio/chart-prep-sample.wav')
  const audioBuffer = fs.readFileSync(audioPath)

  await page.goto('/dashboard')

  // Inject audio blob via page.evaluate
  await page.evaluate(async (audioData) => {
    const blob = new Blob([new Uint8Array(audioData)], { type: 'audio/wav' })
    // Trigger the onRecordingComplete callback with our fixture
    window.__testAudioBlob = blob
  }, [...audioBuffer])

  // Trigger Chart Prep processing with injected audio
  // ...

  // Verify expected sections appear
  await expect(page.locator('[data-testid="chart-prep-summary"]')).toContainText('52-year-old')
  await expect(page.locator('[data-testid="chart-prep-alerts"]')).toContainText('weight loss')
})
```

---

## CI Integration

These fixtures enable CI testing without microphone access:

1. **No browser permissions needed** - Audio blobs injected directly
2. **Deterministic results** - Same audio → same expected output
3. **Fast execution** - No real-time recording delays
4. **Cross-platform** - Works on any CI runner

### GitHub Actions Example

```yaml
- name: Run voice transcription tests
  run: npm run test:voice
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Updating Fixtures

When updating test fixtures:

1. Record new audio following scripts above
2. Run through actual app to get expected output
3. Update expected-outputs JSON
4. Commit both audio and JSON files
5. Update test cases if assertions change

**Note:** Audio files may be large. Consider using Git LFS for files > 1MB:
```bash
git lfs track "*.wav" "*.m4a" "*.mp4"
```
