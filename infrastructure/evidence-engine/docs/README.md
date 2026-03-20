# Sevaro Evidence Engine — Guideline Document Library

This folder holds the neurology clinical guidelines uploaded to the Bedrock Knowledge Base S3 bucket. The `setup.sh` script uploads everything here to `s3://sevaro-neuro-guidelines-{env}/guidelines/`.

---

## What to Add

The Evidence Engine is only as good as the documents it indexes. Start with these high-priority sources:

### Tier 1 — Highest priority (cover 80%+ of neurology consult types)

| Document | Source | Notes |
|----------|--------|-------|
| AAN Headache Guidelines (2019) | `aan.com/Guidelines/home/GuidelineDetail/1000091` | Episodic migraine, preventive therapy |
| IHS ICHD-3 Headache Classification | `ichd-3.org` | Definitive diagnostic criteria |
| AAN Epilepsy Guidelines | `aan.com` | First seizure, refractory epilepsy |
| AHA/ASA Ischemic Stroke Guidelines (2019) | `ahajournals.org` | Acute treatment, secondary prevention |
| AAN Parkinson's Disease Guidelines | `aan.com` | Symptomatic treatment, neuroprotection |
| AAN Dementia/Alzheimer's Guidelines | `aan.com` | Diagnosis, pharmacologic management |
| AAN Multiple Sclerosis Guidelines | `aan.com` | Disease-modifying therapy selection |

### Tier 2 — High value additions

| Document | Source |
|----------|--------|
| AAN Peripheral Neuropathy Guidelines | `aan.com` |
| AAN ALS/MND Guidelines | `aan.com` |
| AAN Myasthenia Gravis Guidelines | `aan.com` |
| DSM-5-TR Cognitive Disorder Criteria | APA (relevant sections) |
| AAN Concussion/TBI Guidelines | `aan.com` |
| AAN Sleep Disorder Guidelines | `aan.com` |

### Tier 3 — Supporting references

| Document | Source |
|----------|--------|
| NINDS Neurological Exam Reference | `ninds.nih.gov` |
| AAN Trigeminal Neuralgia Guidelines | `aan.com` |
| AAN Vestibular Migraine Guidance | `aan.com` |
| ACC/AHA Atrial Fibrillation Guidelines | For stroke risk context |

---

## File Format Requirements

- **Format**: PDF preferred; plain text (`.txt`) also accepted
- **Size limit**: 50 MB per document (Bedrock chunking handles the rest)
- **Naming convention**: `{organization}_{topic}_{year}.pdf`
  - Examples: `aan_migraine_guidelines_2019.pdf`, `ihs_ichd3_classification_2018.pdf`
- **Language**: English only (Titan embedding model)

---

## Copyright & Redistribution Notes

> **Important:** Verify redistribution rights before storing full PDFs in S3.

Most AAN practice guidelines are published under open-access licenses that permit non-commercial use. Check each guideline's license at the point of download. Acceptable alternatives if redistribution is restricted:

1. **Abstracts + structured summaries** — Extract the key diagnostic criteria, treatment algorithms, and evidence grading into structured text files. A 2-page summary of a 40-page guideline often retrieves just as well.
2. **DOI references only** — Store a plain text file with the DOI, citation, and key excerpts (typically covered under fair use for clinical decision support).
3. **License directly** — AAN has a licensing program for health system use.

---

## Adding New Documents

After adding PDFs to this folder:

```bash
# 1. Upload new files to S3
aws s3 sync ./docs/ s3://sevaro-neuro-guidelines-staging/guidelines/ \
  --exclude "README.md" \
  --profile sevaro-sandbox \
  --region us-east-2

# 2. Trigger re-ingestion (replace with your KB_ID and DATA_SOURCE_ID)
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "$BEDROCK_KB_ID" \
  --data-source-id "$DATA_SOURCE_ID" \
  --profile sevaro-sandbox \
  --region us-east-2
```

Ingestion typically takes 5–15 minutes depending on document count and size.

---

## Update Cadence

AAN and AHA/ASA publish updated guidelines annually. Recommended schedule:

- **Quarterly**: Check for new or revised guidelines on `aan.com/Guidelines`
- **On update**: Upload new PDF, trigger ingestion, monitor job completion
- **Annually**: Review the full document set; remove superseded guidelines

---

## Testing Retrieval Quality

After ingestion, test that the KB returns relevant content:

```bash
# Test headache query
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id "$BEDROCK_KB_ID" \
  --retrieval-query '{"text": "migraine with aura diagnostic criteria and first-line treatment"}' \
  --profile sevaro-sandbox \
  --region us-east-2

# Test stroke query
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id "$BEDROCK_KB_ID" \
  --retrieval-query '{"text": "ischemic stroke acute management tPA eligibility criteria"}' \
  --profile sevaro-sandbox \
  --region us-east-2
```

Good retrieval returns 3–5 relevant excerpts with high relevance scores (>0.7).
