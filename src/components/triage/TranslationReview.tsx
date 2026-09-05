import type { TranslationPreview } from '@/lib/triage/translationPreview'
/** No action here can replace the source or authorize a clinical recommendation. */
export default function TranslationReview({original,preview}:{original:string;preview:TranslationPreview}) {
 return <section aria-label="Translation review">
  <h2>Original and review-only translation</h2>
  <p>Language declared: {preview.declaredLanguage}. Detected: {preview.detectedLanguage}. Output: English.</p>
  <p role="note">Translation is unverified. Review medical terms, negation, timing, values and units with a qualified bilingual reviewer. The original remains the authoritative source.</p>
  <details open><summary>Complete original</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}} lang={preview.declaredLanguage}>{original}</pre></details>
  {preview.status==='held'?<p role="alert">Translation held. Review the original; no translated content is available for triage.</p>:preview.segments.map((s,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}><blockquote lang={preview.detectedLanguage} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{s.original}</blockquote><blockquote lang="en" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{s.translated}</blockquote></div>)}
  <ul>{preview.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
  <small>Source: {preview.sourceId} · Model: {preview.model} · Prompt: {preview.promptVersion} · Source hash: {preview.sourceHash}</small>
 </section>
}
