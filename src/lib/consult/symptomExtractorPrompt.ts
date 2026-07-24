/**
 * Shared symptom-extraction system prompt.
 *
 * Used by both:
 *   - The live Background Localizer (src/app/api/ai/historian/localizer/route.ts,
 *     Step 1 — mid-interview symptom extraction).
 *   - The Historian Validation Suite's post-session final differential pass
 *     (src/lib/historian/eval/finalDifferential.ts, Step 1 — same extraction
 *     applied to the complete transcript).
 *
 * Lifted here verbatim (byte-identical to the original inline const in
 * localizer/route.ts) rather than duplicated, so the two call sites can
 * never drift. Next.js App Router route.ts files may only export the
 * recognized handler/config names (GET, POST, etc.) — an arbitrary named
 * const cannot be exported directly from route.ts — so extraction to this
 * shared module was the only way to reuse the prompt without duplicating
 * the text.
 *
 * The live localizer path is in production use; do not change this prompt
 * text without re-validating both call sites.
 */
export const SYMPTOM_EXTRACTOR_PROMPT = `You are a clinical neurologist reviewing a patient intake transcript.
Extract a structured list of symptoms and clinical features from the conversation.

Return JSON matching this exact shape:
{
  "primarySymptoms": ["string"],
  "location": ["string"],
  "temporalPattern": ["string"],
  "severity": ["string"],
  "associatedFeatures": ["string"],
  "redFlags": ["string"],
  "clinicalSummary": "string"
}

Rules:
- Extract only what the patient has explicitly stated — do not infer or assume.
- redFlags: include only features that suggest serious pathology (thunderclap onset, fever, focal deficits, papilledema, progressive, meningismus, etc.).
- clinicalSummary: 1–2 sentences maximum describing the current clinical picture.
- If a field has no data, use an empty array [].
- Do not include assistant questions — only patient-reported content.`
