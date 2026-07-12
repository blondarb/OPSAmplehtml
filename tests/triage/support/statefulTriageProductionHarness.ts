type HarnessRow = Record<string, unknown> & { id: string }

type HarnessDbResult = {
  data: unknown
  error: { message: string; code?: string } | null
}

type QueryOperation = 'select' | 'insert' | 'update'

interface QueryFilter {
  column: string
  value: unknown
}

interface ModelInvocation {
  system?: unknown
  messages?: unknown
}

interface SafetyGatewayLike {
  carePathway: string
  reviewRequirement: string
  version?: string
}

interface SourceBoundStartTrace {
  sourceExtractionId: string
  sourceType: string
  rawText: string
  triageSessionId: string
}

interface PollTrace {
  id: string
  status: string
}

export interface ProductionPathHarnessTrace {
  extractionModelSources: string[]
  safetyModelSources: string[]
  scoringModelPrompts: string[]
  sourceBoundStarts: SourceBoundStartTrace[]
  extractionPolls: PollTrace[]
  triagePolls: PollTrace[]
  notifications: unknown[][]
  adjudicatorSources: string[]
}

interface ModelSafetyValidator {
  (value: unknown, sourceText: string): unknown
}

interface AdjudicatorValidator {
  (value: unknown, sourceText: string): unknown
}

class StatefulQueryBuilder implements PromiseLike<HarnessDbResult> {
  private operation: QueryOperation = 'select'
  private payload: Record<string, unknown> | undefined
  private readonly filters: QueryFilter[] = []
  private singleRow = false
  private maybeSingleRow = false

  constructor(
    private readonly harness: StatefulTriageProductionHarness,
    private readonly table: string,
  ) {}

  select(columns?: string): this {
    void columns
    return this
  }

  insert(payload: Record<string, unknown>): this {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Record<string, unknown>): this {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value })
    return this
  }

  single(): Promise<HarnessDbResult> {
    this.singleRow = true
    return this.execute()
  }

  maybeSingle(): Promise<HarnessDbResult> {
    this.maybeSingleRow = true
    return this.execute()
  }

  then<TResult1 = HarnessDbResult, TResult2 = never>(
    onfulfilled?:
      | ((value: HarnessDbResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<HarnessDbResult> {
    if (this.operation === 'insert') {
      return this.harness.executeInsert(this.table, this.payload ?? {})
    }
    const matching = this.harness
      .rowsFor(this.table)
      .filter((row) =>
        this.filters.every((filter) => row[filter.column] === filter.value),
      )
    if (this.operation === 'update') {
      for (const row of matching) Object.assign(row, this.payload ?? {})
    }

    const data = matching.map((row) => ({ ...row }))
    if (this.singleRow || this.maybeSingleRow) {
      if (data.length === 0) {
        return this.maybeSingleRow
          ? { data: null, error: null }
          : {
              data: null,
              error: { message: 'No rows found.', code: 'PGRST116' },
            }
      }
      if (data.length !== 1) {
        return {
          data: null,
          error: { message: 'Expected one row.', code: 'PGRST116' },
        }
      }
      return { data: data[0], error: null }
    }
    return { data, error: null }
  }
}

/**
 * Stateful, deterministic adapter for no-cloud integration tests.
 *
 * Production route handlers, source-authority validation, the transactional
 * session-start function, background processing coordinator, polling client,
 * and rendering are real. This adapter replaces the external PostgreSQL
 * engine, Bedrock calls, notifications, and scheduling. It deliberately does
 * not claim PostgreSQL SQL/locking/constraint coverage; the repository's
 * dedicated PostgreSQL tests remain responsible for that layer.
 */
export class StatefulTriageProductionHarness {
  private readonly tables = new Map<string, HarnessRow[]>([
    ['triage_extractions', []],
    ['triage_sessions', []],
  ])
  private readonly backgroundQueue: Array<() => Promise<void>> = []
  private extractionSequence = 0
  private triageSequence = 0
  private readonly traceState: ProductionPathHarnessTrace = {
    extractionModelSources: [],
    safetyModelSources: [],
    scoringModelPrompts: [],
    sourceBoundStarts: [],
    extractionPolls: [],
    triagePolls: [],
    notifications: [],
    adjudicatorSources: [],
  }
  private readonly emergencyActions = new Set<string>()

  readonly tenantId = 'tenant-production-parity'

  authorizeClinicalAccess() {
    return Promise.resolve({
      ok: true as const,
      context: {
        userId: 'clinician-production-parity',
        email: 'clinician@synthetic.test',
        tenantId: this.tenantId,
        role: 'clinician' as const,
      },
    })
  }

  from(table: string): StatefulQueryBuilder {
    return new StatefulQueryBuilder(this, table)
  }

  rowsFor(table: string): HarnessRow[] {
    const rows = this.tables.get(table)
    if (!rows) throw new Error(`Unexpected in-memory table: ${table}`)
    return rows
  }

  executeInsert(
    table: string,
    payload: Record<string, unknown>,
  ): HarnessDbResult {
    const id =
      typeof payload.id === 'string'
        ? payload.id
        : table === 'triage_extractions'
          ? `extraction-production-${++this.extractionSequence}`
          : `row-${table}-${this.rowsFor(table).length + 1}`
    const row: HarnessRow = { ...payload, id }
    this.rowsFor(table).push(row)
    return { data: { id }, error: null }
  }

  enqueueBackground(work: () => Promise<void>): void {
    this.backgroundQueue.push(work)
  }

  async flushNextBackground(): Promise<void> {
    const work = this.backgroundQueue.shift()
    if (!work) throw new Error('No queued production background work exists.')
    await work()
  }

  pendingBackgroundCount(): number {
    return this.backgroundQueue.length
  }

  recordExtractionPoll(payload: Record<string, unknown>): void {
    this.traceState.extractionPolls.push({
      id: String(payload.extraction_id ?? ''),
      status: String(payload.status ?? ''),
    })
  }

  recordTriagePoll(payload: Record<string, unknown>): void {
    this.traceState.triagePolls.push({
      id: String(payload.session_id ?? ''),
      status: String(payload.status ?? ''),
    })
  }

  recordNotification(args: unknown[]): Promise<void> {
    this.traceState.notifications.push(args)
    return Promise.resolve()
  }

  async createIngressSafetyWorkflow(rawInput: unknown) {
    const input = rawInput as {
      extractionId: string
      tenantId: string
      sourceType: string
      gateway: SafetyGatewayLike
      coverageStatus?: string
    }
    const existing = this.rowsFor('triage_sessions').find(
      (row) =>
        row.source_extraction_id === input.extractionId &&
        row.tenant_id === input.tenantId,
    )
    if (existing) {
      return { ok: true as const, triageSessionId: existing.id }
    }
    const extraction = this.requireExtraction(input.extractionId)
    const id = `triage-ingress-${++this.triageSequence}`
    this.rowsFor('triage_sessions').push({
      id,
      tenant_id: input.tenantId,
      source_extraction_id: input.extractionId,
      referral_text: extraction.text_input,
      source_type: input.sourceType,
      source_filename: extraction.source_filename ?? null,
      extracted_summary: null,
      extraction_confidence: null,
      note_type_detected: null,
      patient_id: null,
      consult_id: null,
      patient_age: extraction.patient_age ?? null,
      patient_sex: extraction.patient_sex ?? null,
      processing_status: 'pending',
      processing_attempt_count: 0,
      processing_claimed_at: null,
      processing_lease_expires_at: null,
      lease_active: false,
      care_pathway: input.gateway.carePathway,
      data_quality: 'partial',
      coverage_status: input.coverageStatus ?? extraction.coverage_status,
      review_requirement: input.gateway.reviewRequirement,
      workflow_status:
        input.gateway.carePathway === 'emergency_now'
          ? 'emergency_hold'
          : 'clinician_review',
      scheduling_locked: true,
      safety_shadow_result: {
        deterministicGateway: input.gateway,
        persistedCarePathwayFloor: input.gateway.carePathway,
      },
      ai_raw_response: null,
      missing_information: [],
      clinical_reasons: [],
      red_flags: [],
      suggested_workup: [],
      failed_therapies: [],
    })
    return { ok: true as const, triageSessionId: id }
  }

  getPool() {
    return Promise.resolve({
      connect: async () => ({
        query: (sql: string, parameters: unknown[] = []) =>
          this.executeSessionStartSql(sql, parameters),
        release: () => undefined,
      }),
    })
  }

  private async executeSessionStartSql(
    sql: string,
    parameters: unknown[],
  ): Promise<{ rows: HarnessRow[]; rowCount: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) {
      return { rows: [], rowCount: 0 }
    }

    if (
      normalized.includes('SELECT id FROM triage_extractions') &&
      normalized.includes('FOR UPDATE')
    ) {
      const extraction = this.rowsFor('triage_extractions').find(
        (row) => row.id === parameters[0] && row.tenant_id === parameters[1],
      )
      return {
        rows: extraction ? [{ id: extraction.id }] : [],
        rowCount: extraction ? 1 : 0,
      }
    }

    if (
      normalized.includes('FROM triage_sessions') &&
      normalized.includes('WHERE source_extraction_id = $1') &&
      normalized.includes('lease_active')
    ) {
      const session = this.rowsFor('triage_sessions').find(
        (row) =>
          row.source_extraction_id === parameters[0] &&
          row.tenant_id === parameters[1],
      )
      if (!session) return { rows: [], rowCount: 0 }
      return {
        rows: [
          {
            id: session.id,
            processing_status: session.processing_status,
            patient_id: session.patient_id ?? null,
            consult_id: session.consult_id ?? null,
            processing_attempt_count: session.processing_attempt_count,
            lease_active: session.lease_active === true,
          },
        ],
        rowCount: 1,
      }
    }

    if (
      normalized.startsWith('UPDATE triage_sessions SET referral_text = $3')
    ) {
      const session = this.requireSession(String(parameters[0]))
      if (session.tenant_id !== parameters[1]) return { rows: [], rowCount: 0 }
      Object.assign(session, {
        referral_text: parameters[2],
        patient_age: parameters[3] ?? session.patient_age ?? null,
        patient_sex: parameters[4] ?? session.patient_sex ?? null,
        referring_provider_type:
          parameters[5] ?? session.referring_provider_type ?? null,
        source_type: parameters[6],
        source_filename: parameters[7] ?? session.source_filename ?? null,
        extracted_summary: parameters[8] ?? session.extracted_summary ?? null,
        extraction_confidence:
          parameters[9] ?? session.extraction_confidence ?? null,
        note_type_detected:
          parameters[10] ?? session.note_type_detected ?? null,
        batch_id: parameters[11] ?? session.batch_id ?? null,
        fusion_group_id: parameters[12] ?? session.fusion_group_id ?? null,
        ai_model_used: parameters[13],
        processing_status: 'pending',
        error_message: null,
        completed_at: null,
        processing_claimed_at: new Date(),
        processing_lease_expires_at: new Date(Date.now() + 180_000),
        processing_attempt_count:
          Number(session.processing_attempt_count ?? 0) + 1,
        lease_active: true,
      })
      this.traceState.sourceBoundStarts.push({
        sourceExtractionId: String(session.source_extraction_id),
        sourceType: String(parameters[6]),
        rawText: String(parameters[2]),
        triageSessionId: session.id,
      })
      return { rows: [{ id: session.id }], rowCount: 1 }
    }

    throw new Error(`Unexpected PostgreSQL seam in parity harness: ${normalized}`)
  }

  async invokeClinicalModel(rawInput: unknown) {
    const input = rawInput as ModelInvocation
    const system = String(input.system ?? '')
    const messages = Array.isArray(input.messages) ? input.messages : []
    const firstMessage = messages[0] as Record<string, unknown> | undefined
    const content = String(firstMessage?.content ?? '')

    if (system.includes('neurology clinical data extraction system')) {
      const startMarker = '--- CLINICAL DOCUMENT ---\n'
      const endMarker = '\n--- END CLINICAL DOCUMENT ---'
      const start = content.indexOf(startMarker)
      const end = content.lastIndexOf(endMarker)
      if (start < 0 || end <= start) {
        throw new Error('Extraction fixture did not receive a complete document.')
      }
      const source = content.slice(start + startMarker.length, end)
      this.assertCompleteSource(source)
      this.traceState.extractionModelSources.push(source)
      return {
        parsed: this.fixedExtractionModelResult(),
        inputTokens: 300,
        outputTokens: 180,
      }
    }

    if (system.includes('neurology clinical decision support system')) {
      this.traceState.scoringModelPrompts.push(content)
      if (!content.includes('resolved acute focal neurologic episode')) {
        throw new Error('Scoring fixture received an unexpected extraction.')
      }
      return {
        parsed: this.fixedTriageModelResult(),
        inputTokens: 420,
        outputTokens: 220,
      }
    }

    throw new Error('Unexpected clinical-model invocation in parity harness.')
  }

  async runSafetyModel(
    sourceText: string,
    validate: ModelSafetyValidator,
  ): Promise<unknown> {
    this.assertCompleteSource(sourceText)
    this.traceState.safetyModelSources.push(sourceText)
    return validate(
      {
        care_pathway: 'emergency_now',
        data_quality: 'sufficient',
        critical_unknowns: [],
        signals: [
          {
            code: 'acute_focal_deficit_recent',
            syndrome: 'acute_cerebrovascular',
            assertion: 'present',
            temporality: 'recent',
            experiencer: 'patient',
            action: 'emergency_now',
            evidence: [
              {
                quote:
                  'acute-onset right facial droop, right hand numbness, and expressive language difficulty',
                occurrence_index: 0,
              },
            ],
          },
        ],
      },
      sourceText,
    )
  }

  async runAdjudicator(
    sourceText: string,
    validate: AdjudicatorValidator,
  ) {
    this.assertCompleteSource(sourceText)
    this.traceState.adjudicatorSources.push(sourceText)
    return validate(
      {
        care_pathway: 'emergency_now',
        rationale:
          'The exact source contains a recent acute focal neurologic episode.',
        evidence: [
          {
            quote:
              'acute-onset right facial droop, right hand numbness, and expressive language difficulty',
            occurrence_index: 0,
          },
        ],
        unresolved_conflicts: [],
      },
      sourceText,
    )
  }

  async persistEmergencyGatewayResult(args: unknown[]): Promise<boolean> {
    const [sessionId, tenantId, gatewayRaw, processingAttemptCount] = args
    const session = this.requireSession(String(sessionId))
    const gateway = gatewayRaw as SafetyGatewayLike & Record<string, unknown>
    if (
      session.tenant_id !== tenantId ||
      session.processing_status !== 'pending' ||
      session.processing_attempt_count !== processingAttemptCount
    ) {
      return false
    }
    const carePathway =
      session.care_pathway === 'emergency_now' ||
      gateway.carePathway === 'emergency_now'
        ? 'emergency_now'
        : gateway.carePathway
    Object.assign(session, {
      care_pathway: carePathway,
      data_quality: 'partial',
      review_requirement:
        carePathway === 'emergency_now'
          ? 'emergency_action'
          : gateway.reviewRequirement,
      workflow_status:
        carePathway === 'emergency_now'
          ? 'emergency_hold'
          : 'clinician_review',
      scheduling_locked: true,
      safety_shadow_result: {
        deterministicGateway: gateway,
        persistedCarePathwayFloor: carePathway,
      },
    })
    if (carePathway === 'emergency_now') this.emergencyActions.add(session.id)
    return true
  }

  async persistModelSafetyFusion(rawInput: unknown) {
    const input = rawInput as {
      triageSessionId: string
      tenantId: string
      processingAttemptCount: number
      safetyResult: unknown
      safetyFailure?: unknown
      scoringStatus: string
      scoringFailure?: unknown
      fusion: {
        carePathway: string
        dataQuality: string
        reviewRequirement: string
      }
      adjudicatorResult?: unknown
      adjudicatorFailure?: unknown
    }
    const session = this.requireSession(input.triageSessionId)
    if (
      session.tenant_id !== input.tenantId ||
      session.processing_status !== 'pending' ||
      session.processing_attempt_count !== input.processingAttemptCount
    ) {
      return { ok: false as const }
    }
    const carePathway =
      session.care_pathway === 'emergency_now' ||
      input.fusion.carePathway === 'emergency_now'
        ? 'emergency_now'
        : input.fusion.carePathway
    const workflowStatus =
      carePathway === 'emergency_now'
        ? 'emergency_hold'
        : 'clinician_review'
    const reviewRequirement =
      carePathway === 'emergency_now'
        ? 'emergency_action'
        : input.fusion.reviewRequirement
    const prior = this.asRecord(session.safety_shadow_result)
    Object.assign(session, {
      care_pathway: carePathway,
      data_quality: input.fusion.dataQuality,
      review_requirement: reviewRequirement,
      workflow_status: workflowStatus,
      scheduling_locked: true,
      safety_shadow_result: {
        ...prior,
        modelSafety: input.safetyResult,
        modelSafetyFailure: input.safetyFailure ?? null,
        outpatientScoring: {
          status: input.scoringStatus,
          failure: input.scoringFailure ?? null,
        },
        fusion: input.fusion,
        persistedCarePathwayFloor: carePathway,
        adjudicator: input.adjudicatorResult ?? null,
        adjudicatorFailure: input.adjudicatorFailure ?? null,
      },
    })
    if (carePathway === 'emergency_now') this.emergencyActions.add(session.id)
    return {
      ok: true as const,
      carePathway,
      dataQuality: input.fusion.dataQuality,
      reviewRequirement,
      workflowStatus,
    }
  }

  async finalizeTriageAttempt(rawInput: unknown) {
    const input = rawInput as {
      triageSessionId: string
      tenantId: string
      processingAttemptCount: number
      proposedCarePathway: string
      scoringTier: string
      confidence: string
      dimensionScores: unknown
      weightedScore: number | null
      clinicalReasons: string[]
      redFlags: string[]
      suggestedWorkup: string[]
      failedTherapies: unknown[]
      missingInformation: unknown
      subspecialtyRecommendation: string
      subspecialtyRationale: string
      aiRawResponse: unknown
      aiInputTokens: number | null
      aiOutputTokens: number | null
    }
    const session = this.requireSession(input.triageSessionId)
    if (
      session.tenant_id !== input.tenantId ||
      session.processing_status !== 'pending' ||
      session.processing_attempt_count !== input.processingAttemptCount
    ) {
      return { ok: false as const, reason: 'claim_or_binding_changed' as const }
    }
    const hasEmergencyFloor =
      session.care_pathway === 'emergency_now' ||
      input.proposedCarePathway === 'emergency_now' ||
      this.emergencyActions.has(session.id)
    const carePathway = hasEmergencyFloor
      ? 'emergency_now'
      : input.proposedCarePathway
    const triageTier = hasEmergencyFloor ? 'emergent' : input.scoringTier
    const reviewRequirement =
      carePathway === 'emergency_now'
        ? 'emergency_action'
        : carePathway === 'same_day_clinician_review'
          ? 'immediate_clinician_review'
          : String(session.review_requirement ?? 'clinician_confirmation')
    const workflowStatus =
      carePathway === 'emergency_now'
        ? 'emergency_hold'
        : 'clinician_review'
    Object.assign(session, {
      triage_tier: triageTier,
      confidence: input.confidence,
      dimension_scores: input.dimensionScores,
      weighted_score: input.weightedScore,
      clinical_reasons: input.clinicalReasons,
      red_flags: input.redFlags,
      suggested_workup: input.suggestedWorkup,
      failed_therapies: input.failedTherapies,
      missing_information: input.missingInformation,
      subspecialty_recommendation: input.subspecialtyRecommendation,
      subspecialty_rationale: input.subspecialtyRationale,
      ai_raw_response: input.aiRawResponse,
      ai_input_tokens: input.aiInputTokens,
      ai_output_tokens: input.aiOutputTokens,
      care_pathway: carePathway,
      review_requirement: reviewRequirement,
      workflow_status: workflowStatus,
      scheduling_locked: true,
      processing_status: 'complete',
      processing_claimed_at: null,
      processing_lease_expires_at: null,
      lease_active: false,
      completed_at: new Date(),
    })
    return {
      ok: true as const,
      triageTier,
      carePathway,
      dataQuality: String(session.data_quality),
      reviewRequirement,
      workflowStatus,
      consultId: null,
    }
  }

  seedDecoyExtraction(text: string): string {
    const id = `extraction-decoy-${++this.extractionSequence}`
    this.rowsFor('triage_extractions').push({
      id,
      tenant_id: this.tenantId,
      status: 'complete',
      text_input: text,
      extracted_summary: 'Unrelated decoy extraction.',
      source_filename: null,
    })
    return id
  }

  truncatePersistedSourceAfterMarker(
    extractionId: string,
    marker: string,
  ): void {
    const row = this.requireExtraction(extractionId)
    const source = String(row.text_input)
    const markerIndex = source.indexOf(marker)
    if (markerIndex < 0) throw new Error('Late-page marker was not persisted.')
    const truncated = source.slice(0, markerIndex + marker.length)
    if (truncated.length >= source.length) {
      throw new Error('Fixture does not contain a tail after the late-page marker.')
    }
    // Leave source_pages, packet_plan, and source_sha256 untouched. The real
    // source-authority validator must detect the cross-artifact truncation.
    row.text_input = truncated
  }

  extractionRow(extractionId: string): Readonly<HarnessRow> {
    return { ...this.requireExtraction(extractionId) }
  }

  trace(): ProductionPathHarnessTrace {
    return {
      extractionModelSources: [...this.traceState.extractionModelSources],
      safetyModelSources: [...this.traceState.safetyModelSources],
      scoringModelPrompts: [...this.traceState.scoringModelPrompts],
      sourceBoundStarts: this.traceState.sourceBoundStarts.map((item) => ({
        ...item,
      })),
      extractionPolls: this.traceState.extractionPolls.map((item) => ({
        ...item,
      })),
      triagePolls: this.traceState.triagePolls.map((item) => ({ ...item })),
      notifications: this.traceState.notifications.map((item) => [...item]),
      adjudicatorSources: [...this.traceState.adjudicatorSources],
    }
  }

  private requireExtraction(extractionId: string): HarnessRow {
    const row = this.rowsFor('triage_extractions').find(
      (candidate) => candidate.id === extractionId,
    )
    if (!row) throw new Error(`Extraction not found: ${extractionId}`)
    return row
  }

  private requireSession(sessionId: string): HarnessRow {
    const row = this.rowsFor('triage_sessions').find(
      (candidate) => candidate.id === sessionId,
    )
    if (!row) throw new Error(`Triage session not found: ${sessionId}`)
    return row
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  }

  private assertCompleteSource(source: string): void {
    if (
      !source.includes(
        'acute-onset right facial droop, right hand numbness, and expressive language difficulty',
      )
    ) {
      throw new Error('Late-page focal deficit was truncated or source-mixed.')
    }
  }

  private fixedExtractionModelResult() {
    return {
      note_type_detected: 'referral',
      extraction_confidence: 'high',
      extracted_summary:
        'Synthetic resolved acute focal neurologic episode with right facial droop, right hand numbness, and expressive language difficulty lasting 15-20 minutes in the setting of atrial fibrillation and an apixaban interruption. Evaluate the time-critical cerebrovascular concern; the exact last-known-well time requires confirmation.',
      key_findings: {
        chief_complaint: 'Resolved acute focal neurologic episode',
        neurological_symptoms: [
          'Right facial droop',
          'Right hand numbness',
          'Expressive language difficulty',
        ],
        timeline: 'Resolved after 15-20 minutes.',
        relevant_history:
          'Atrial fibrillation with a documented apixaban interruption.',
        medications_and_therapies: ['Apixaban'],
        failed_therapies: [],
        imaging_results: [],
        red_flags_noted: ['Acute focal neurologic episode'],
        functional_status: 'Returned to baseline after the episode.',
      },
    }
  }

  private fixedTriageModelResult() {
    return {
      // This is intentionally a valid but clinically under-triaged scorer
      // fixture. The production deterministic/safety fusion and adjudicator
      // must still preserve the emergency floor for both source modalities.
      emergent_override: false,
      emergent_reason: null,
      insufficient_data: false,
      missing_information: [
        'SAFETY: exact last-known-well and symptom-onset time requires confirmation.',
      ],
      confidence: 'high',
      dimension_scores: {
        symptom_acuity: {
          score: 2,
          rationale: 'Symptoms resolved before referral review.',
        },
        diagnostic_concern: {
          score: 3,
          rationale: 'Focal episode merits specialist evaluation.',
        },
        rate_of_progression: {
          score: 2,
          rationale: 'No ongoing progression is documented.',
        },
        functional_impairment: {
          score: 2,
          rationale: 'The patient returned to baseline.',
        },
        red_flag_presence: {
          score: 2,
          rationale: 'The episode is no longer active.',
        },
      },
      red_flag_override: false,
      clinical_reasons: [
        'Recent acute focal deficits occurred during an anticoagulation interruption.',
      ],
      red_flags: [
        'Right facial droop, hand numbness, and expressive language difficulty — focal cerebrovascular warning.',
      ],
      suggested_workup: [
        'MRI brain without contrast — synthetic outpatient scorer suggestion.',
        'CTA head and neck — synthetic outpatient scorer suggestion.',
      ],
      failed_therapies: [],
      subspecialty_recommendation: 'Stroke',
      subspecialty_rationale:
        'Stroke expertise is appropriate after the emergency evaluation pathway.',
      redirect_to_non_neuro: false,
      redirect_specialty: null,
      redirect_rationale: null,
      safety_anticoagulation: 'Apixaban interruption documented.',
      safety_symptom_onset_time: null,
      safety_allergies: null,
      safety_implanted_devices: null,
      safety_pregnancy_status: null,
      safety_recent_procedures: null,
      safety_renal_function: null,
    }
  }
}
