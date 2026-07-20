import { describe, expect, it } from "vitest";

import { runEmergencyGateway } from "@/lib/triage/emergencyGateway";

const emergencyCases = [
  [
    "Sudden right facial droop and aphasia began 20 minutes ago.",
    "acute_cerebrovascular",
  ],
  [
    "Worst headache of her life, maximal at onset, started just now.",
    "intracranial_hemorrhage_or_sah",
  ],
  [
    "Continuous generalized seizure for 8 minutes without recovery.",
    "status_or_recurrent_seizure",
  ],
  [
    "New urinary retention, saddle anesthesia, and rapidly worsening bilateral leg weakness.",
    "acute_spinal_cord_or_cauda_equina",
  ],
  [
    "Patient with a high spinal cord injury now has blood pressure 224/118, pounding headache, flushing, sweating above the injury, and a blocked urinary catheter.",
    "autonomic_dysreflexia",
  ],
  [
    "Fever, neck stiffness, severe headache, and new confusion today.",
    "acute_cns_infection",
  ],
  [
    "Progressive bulbar weakness and now cannot handle secretions.",
    "neuromuscular_respiratory_or_bulbar_failure",
  ],
  [
    "Sudden painful loss of vision in the left eye this morning.",
    "acute_vision_threat",
  ],
  [
    "Found unresponsive after a fall; mental status is rapidly declining.",
    "traumatic_neurologic_deterioration",
  ],
  [
    "I intend to kill myself tonight and have a plan.",
    "suicide_or_violence_risk",
  ],
] as const;

const nonEmergencyCases = [
  "The patient denies sudden weakness, facial droop, aphasia, or vision loss.",
  "Remote stroke in 2004 with stable residual weakness and no new symptoms.",
  "Family history: mother had status epilepticus.",
  "Discharge instructions: call 911 for sudden weakness, facial droop, or aphasia.",
  "Rule out cauda equina; explicitly no urinary retention, saddle anesthesia, or leg weakness.",
  "Chronic migraine identical to prior headaches, not sudden and not the worst headache.",
  "Remote cervical spinal cord injury with stable tetraplegia. Blood pressure is 122/74. No headache, flushing, sweating, bladder distension, or blocked catheter.",
] as const;

describe("runEmergencyGateway", () => {
  it.each(emergencyCases)(
    "routes an active emergency to emergency_now: %s",
    (text, expectedSyndrome) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).toBe("emergency_now");
      expect(result.reviewRequirement).toBe("emergency_action");
      expect(result.schedulingLocked).toBe(true);
      const signal = result.signals.find(
        (candidate) => candidate.syndrome === expectedSyndrome,
      );
      expect(signal).toBeDefined();
      expect(signal?.assertion).toBe("present");
      expect(signal?.action).toBe("emergency_now");
      expect(signal?.evidence[0]?.quote.trim().length).toBeGreaterThan(0);
    },
  );

  it.each(nonEmergencyCases)(
    "does not treat a negated, historical, contextual, instructional, or stable statement as an emergency: %s",
    (text) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).not.toBe("emergency_now");
      expect(
        result.signals.some(
          (signal) =>
            signal.assertion === "present" &&
            signal.action === "emergency_now",
        ),
      ).toBe(false);
    },
  );

  it("routes an uncertain possible new aphasia for immediate same-day clinician review", () => {
    const result = runEmergencyGateway(
      "Possible new aphasia, but onset and current status are unclear.",
    );

    expect(result.carePathway).toBe("same_day_clinician_review");
    expect(result.reviewRequirement).toBe("immediate_clinician_review");
    expect(result.schedulingLocked).toBe(true);
    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "uncertain" &&
          signal.action === "immediate_clinician_review",
      ),
    ).toBe(true);
  });

  it("preserves packet, document, page, and exact source offsets in evidence provenance", () => {
    const text =
      "History reviewed. Sudden right facial droop and aphasia began 20 minutes ago. Activate emergency response.";
    const result = runEmergencyGateway(text, {
      packetId: "packet-1",
      documentId: "document-1",
      pageNumber: 87,
    });
    const signal = result.signals.find(
      (candidate) => candidate.syndrome === "acute_cerebrovascular",
    );

    expect(signal).toBeDefined();
    const evidence = signal?.evidence[0];
    expect(evidence?.packetId).toBe("packet-1");
    expect(evidence?.documentId).toBe("document-1");
    expect(evidence?.pageNumber).toBe(87);
    expect(
      text.slice(evidence?.startOffset, evidence?.endOffset),
    ).toBe(evidence?.quote);
  });

  it.each(["Neurologic symptoms are stable at the routine follow-up visit."])(
    "keeps ordinary text on the locked routine pathway: %s",
    (text) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).toBe("routine_outpatient");
      expect(result.reviewRequirement).toBe("clinician_confirmation");
      expect(result.schedulingLocked).toBe(true);
      expect(result.signals).toHaveLength(0);
    },
  );

  it.each([
    "Fever with a new severe headache that began today.",
    "Fever with sudden confusion and altered mental status today.",
    "Fever with new neck stiffness and meningismus today.",
  ])("flags an acute CNS infection pattern with headache, AMS, or meningeal features: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cns_infection",
      ),
    ).toBe(true);
  });

  it.each([
    "New sudden severe headache today with right facial droop.",
    "New sudden severe headache today followed by syncope.",
    "Postpartum day 5 with a new sudden severe headache today.",
    "Taking warfarin with a new sudden severe headache today.",
    "New sudden severe headache today with loss of consciousness.",
  ])("flags a new sudden severe headache with a high-risk companion: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "intracranial_hemorrhage_or_sah",
      ),
    ).toBe(true);
  });

  it("flags papilledema with rapidly worsening headache and vomiting", () => {
    const result = runEmergencyGateway(
      "Papilledema with a rapidly worsening headache and repeated vomiting today.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "raised_intracranial_pressure",
      ),
    ).toBe(true);
  });

  it("flags sudden acute confusion without trauma", () => {
    const result = runEmergencyGateway(
      "Sudden confusion today; the patient is not making sense.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "altered_mental_status_or_coma",
      ),
    ).toBe(true);
  });

  it("flags an anticoagulated head injury with new confusion", () => {
    const result = runEmergencyGateway(
      "Taking apixaban, the patient fell and struck her head and now has new confusion.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "traumatic_neurologic_deterioration",
      ),
    ).toBe(true);
  });

  it.each([
    "Family history. Status epilepticus.",
    "Remote history. Sudden right facial droop and aphasia occurred in 2004.",
    "Sudden facial droop and aphasia now. These are copied discharge return precautions, not current symptoms.",
  ])("suppresses contextual non-events across sentence boundaries: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).not.toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "present" &&
          signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it("does not let an earlier denial suppress a later active contrast clause", () => {
    const result = runEmergencyGateway(
      "Denies chronic weakness, but now has sudden facial droop and aphasia.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "acute_cerebrovascular" &&
          signal.assertion === "present",
      ),
    ).toBe(true);
  });

  it("does not suppress a current emergency merely because discharge instructions follow", () => {
    const result = runEmergencyGateway(
      "Sudden facial droop and aphasia now. Discharge instructions will be provided after evaluation.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "acute_cerebrovascular" &&
          signal.assertion === "present",
      ),
    ).toBe(true);
  });

  it("does not use an unrelated later non-current statement to erase an emergency", () => {
    const result = runEmergencyGateway(
      "Sudden facial droop and aphasia now. Her chronic shoulder pain is not currently present.",
    );

    expect(result.carePathway).toBe("emergency_now");
  });

  it.each([
    "No headache; sudden aphasia now.",
    "Sudden aphasia now; call 911.",
  ])("limits negation and education suppression to the relevant clause: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).toBe("emergency_now");
  });

  it.each([
    "Daughter reports the patient developed sudden facial droop now.",
    "Mother is present. The patient has sudden facial droop and aphasia now.",
    "The patient's wife has noticed sudden facial droop and slurred speech that began 20 minutes ago.",
    "The patient's husband reports sudden facial droop and slurred speech that began 20 minutes ago.",
    "The patient's daughter states sudden facial droop and slurred speech began 20 minutes ago.",
    "The patient's son says sudden facial droop and slurred speech began 20 minutes ago.",
    "The caregiver observed sudden facial droop and slurred speech beginning 20 minutes ago.",
    "The nurse reports sudden facial droop and slurred speech beginning 20 minutes ago.",
    "The provider reports sudden facial droop and slurred speech beginning 20 minutes ago.",
  ])("does not mistake a family reporter for the symptom experiencer: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).toBe("emergency_now");
  });

  it.each([
    [
      "Fever today. New neck stiffness and confusion.",
      "acute_cns_infection",
    ],
    [
      "Aphasia. Began 20 minutes ago.",
      "acute_cerebrovascular",
    ],
  ] as const)("combines bounded adjacent evidence: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(true);
  });

  it("does not let an unrelated negation inside a bounded span suppress aphasia", () => {
    const result = runEmergencyGateway(
      "Aphasia. No headache, but began 20 minutes ago.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cerebrovascular",
      ),
    ).toBe(true);
  });

  it("combines a cauda-equina symptom cluster split across sentences", () => {
    const result = runEmergencyGateway(
      "New urinary retention. Saddle anesthesia started today.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_spinal_cord_or_cauda_equina",
      ),
    ).toBe(true);
  });

  it("does not let administrative new-referral language reactivate remote deficits", () => {
    const result = runEmergencyGateway(
      "New referral for remote stroke in 2004 with stable residual weakness.",
    );

    expect(result.carePathway).not.toBe("emergency_now");
    expect(result.signals).toHaveLength(0);
  });

  it("does not treat encounter timing as evidence that a remote deficit is current", () => {
    const result = runEmergencyGateway(
      "Remote stroke in 2004 with stable right-sided weakness, seen today for routine follow-up.",
    );

    expect(result.carePathway).not.toBe("emergency_now");
    expect(result.signals).toHaveLength(0);
  });

  it("requires the current symptom—not merely the visit—to follow historical language", () => {
    const result = runEmergencyGateway(
      "Remote stroke in 2004 with stable right-sided weakness, but now seen for routine follow-up.",
    );

    expect(result.carePathway).not.toBe("emergency_now");
    expect(result.signals).toHaveLength(0);
  });

  it.each([
    "Remote stroke with stable right-sided weakness, currently here for medication refill.",
    "Remote stroke with stable right-sided weakness, currently unchanged on exam.",
  ])("does not use currently to reactivate a stable historical deficit: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).not.toBe("emergency_now");
    expect(result.signals).toHaveLength(0);
  });

  it("preserves a genuinely new symptom after a stable historical deficit", () => {
    const result = runEmergencyGateway(
      "Remote stroke with stable right-sided weakness, but now has new aphasia.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cerebrovascular",
      ),
    ).toBe(true);
  });

  it.each([
    "Remote stroke, now has new aphasia but chronic right-sided weakness is stable.",
    "Remote stroke, now has sudden aphasia while the chronic weakness remains unchanged.",
  ])("does not let later stable language erase an earlier new symptom: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cerebrovascular",
      ),
    ).toBe(true);
  });

  it.each([
    "Remote history. The patient now has sudden aphasia today.",
    "Family history. The patient is now in a continuous seizure for 8 minutes without recovery.",
  ])("does not let an unrelated heading suppress an explicitly current patient emergency: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).toBe("emergency_now");
  });

  it("deduplicates a syndrome while retaining evidence from both acute sentences", () => {
    const result = runEmergencyGateway(
      "Sudden right facial droop and aphasia began 20 minutes ago. New slurred speech started now.",
    );
    const signals = result.signals.filter(
      (signal) => signal.syndrome === "acute_cerebrovascular",
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].evidence).toHaveLength(2);
    expect(signals[0].evidence.map((evidence) => evidence.quote)).toEqual([
      "Sudden right facial droop and aphasia began 20 minutes ago.",
      "New slurred speech started now.",
    ]);
  });

  it("gives a present emergency precedence over an uncertain signal", () => {
    const result = runEmergencyGateway(
      "Possible new aphasia, but onset is unclear. Continuous seizure for 8 minutes without recovery.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(result.reviewRequirement).toBe("emergency_action");
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "acute_cerebrovascular" &&
          signal.assertion === "uncertain",
      ),
    ).toBe(true);
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "status_or_recurrent_seizure" &&
          signal.assertion === "present",
      ),
    ).toBe(true);
  });

  it.each([
    ["Sudden diplopia began today.", "acute_cerebrovascular"],
    [
      "Sudden facial droop and aphasia today, now resolved after 10 minutes.",
      "acute_cerebrovascular",
    ],
    ["Crescendo TIAs occurred three times today.", "acute_cerebrovascular"],
    [
      "Headache was maximal at onset and began just now.",
      "intracranial_hemorrhage_or_sah",
    ],
    [
      "Sudden thunderclap headache began 10 minutes ago.",
      "intracranial_hemorrhage_or_sah",
    ],
    [
      "First seizure today during pregnancy.",
      "status_or_recurrent_seizure",
    ],
    [
      "First seizure today with persistent right-sided weakness.",
      "status_or_recurrent_seizure",
    ],
    [
      "Continuous seizures for 8 minutes without recovery.",
      "status_or_recurrent_seizure",
    ],
    [
      "New urinary retention with severe back pain and metastatic cancer.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "New severe back pain with progressive leg weakness and spinal infection.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "Rapidly progressive bulbar weakness today.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    [
      "Myasthenia gravis with new dyspnea today.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    [
      "New retinal artery occlusion in the left eye today.",
      "acute_vision_threat",
    ],
    [
      "Acute retinal detachment with a curtain over vision today.",
      "acute_vision_threat",
    ],
    [
      "She says she cannot keep herself safe tonight.",
      "suicide_or_violence_risk",
    ],
    [
      "The patient takes apixaban and struck her head today but remains alert.",
      "traumatic_neurologic_deterioration",
    ],
  ] as const)(
    "covers an additional design-mandated emergency presentation: %s",
    (text, syndrome) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).toBe("emergency_now");
      expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
        true,
      );
    },
  );

  it.each([
    "Patient denies headache and reports sudden aphasia now.",
    "Possible migraine, but now has sudden aphasia.",
    "Denies suicidal thoughts, but going to kill myself tonight.",
    "Remote stroke, seen today for new sudden aphasia.",
  ])("uses the active feature clause instead of unrelated context: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).toBe("emergency_now");
  });

  it.each([
    "Patient's mother had status epilepticus.",
    "New patient for stroke follow-up.",
    "History of acute stroke with stable residual right-sided weakness.",
  ])("does not turn a family or encounter-history phrase into an emergency: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).not.toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "present" &&
          signal.experiencer === "patient" &&
          signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it("does not combine emergency features belonging to different experiencers", () => {
    const result = runEmergencyGateway(
      "Mother had fever. Patient has new confusion today.",
    );

    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cns_infection",
      ),
    ).toBe(false);
  });

  it.each([
    [
      "Cannot handle secretions now. Progressive bulbar weakness.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    [
      "Found unresponsive. Fell and struck her head today.",
      "traumatic_neurologic_deterioration",
    ],
  ] as const)("combines bounded evidence in either order: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it("retains contextual lexical hits with the full evidence contract", () => {
    const text = "Family history: mother had status epilepticus.";
    const result = runEmergencyGateway(text, {
      packetId: "packet-1",
      documentId: "document-1",
      pageNumber: 9,
      extractionMethod: "ocr",
      extractionConfidence: 0.82,
    });

    expect(result.lexicalHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "deterministic",
          syndrome: "status_or_recurrent_seizure",
          assertion: "present",
          temporality: "historical",
          experiencer: "family",
          matchedRule: true,
          suppressed: true,
          evidence: expect.arrayContaining([
            expect.objectContaining({
              packetId: "packet-1",
              documentId: "document-1",
              pageNumber: 9,
              extractionMethod: "ocr",
              extractionConfidence: 0.82,
            }),
          ]),
        }),
      ]),
    );
  });

  it("retains a negated raw keyword hit even when it does not complete a rule", () => {
    const result = runEmergencyGateway(
      "The patient denies seizure, weakness, or vision loss.",
    );

    expect(result.lexicalHits.length).toBeGreaterThan(0);
    expect(result.lexicalHits.every((hit) => hit.suppressed)).toBe(true);
    expect(
      result.lexicalHits.some((hit) => hit.assertion === "negated"),
    ).toBe(true);
    expect(result.carePathway).toBe("routine_outpatient");
  });

  it("fails closed when the gateway cannot evaluate its input", () => {
    const result = runEmergencyGateway(null as unknown as string);

    expect(result.status).toBe("failed");
    expect(result.failureCode).toBe("gateway_execution_failed");
    expect(result.carePathway).toBe("undetermined");
    expect(result.reviewRequirement).toBe("immediate_clinician_review");
    expect(result.schedulingLocked).toBe(true);
  });

  it.each([
    "Follow-up after acute stroke last month, stable with no new deficits.",
    "Seen after an acute stroke last month; stable residual weakness.",
    "First seizure yesterday, now back to baseline, no injury and not pregnant.",
    "New patient with myasthenia gravis and no dyspnea.",
  ])("does not promote a stable or explicitly negated risk context: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).not.toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "present" &&
          signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it("does not discard a recently resolved TIA as remote history", () => {
    const result = runEmergencyGateway(
      "TIA yesterday lasting 5 minutes, now resolved.",
    );

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cerebrovascular",
      ),
    ).toBe(true);
  });

  it.each([
    [
      "New severe back pain with metastatic cancer.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "She cannot handle secretions now.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    [
      "Patient is unable to maintain safety at home tonight.",
      "suicide_or_violence_risk",
    ],
    [
      "New focal weakness after head injury today.",
      "traumatic_neurologic_deterioration",
    ],
    ["Sudden left arm weakness began today.", "acute_cerebrovascular"],
    ["Sudden ataxia began today.", "acute_cerebrovascular"],
    [
      "New severe headache with BP 220/120 today.",
      "intracranial_hemorrhage_or_sah",
    ],
    [
      "Retinal detachment with a curtain over vision.",
      "acute_vision_threat",
    ],
  ] as const)("covers a required emergency wording variant: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it.each([
    ["Suspected meningitis with neck stiffness today.", "acute_cns_infection"],
    [
      "Concern for subarachnoid hemorrhage today.",
      "intracranial_hemorrhage_or_sah",
    ],
  ] as const)(
    "holds an explicitly suspected time-critical diagnosis for immediate review: %s",
    (text, syndrome) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).toBe("same_day_clinician_review");
      expect(result.reviewRequirement).toBe("immediate_clinician_review");
      expect(
        result.signals.some(
          (signal) =>
            signal.syndrome === syndrome && signal.assertion === "uncertain",
        ),
      ).toBe(true);
    },
  );

  it.each([
    "Fever today. No confusion.",
    "Fever today. Family history: meningitis.",
    "Call 911 if sudden weakness develops.",
    "Fever today. Return precautions: seek emergency care if neck stiffness.",
    "Chronic stable urinary retention. Patient education: saddle anesthesia requires ED evaluation.",
    "New severe headache today with no syncope, not pregnant, and not anticoagulated.",
    "The patient fell and hit her head today but is not anticoagulated and remains alert.",
  ])("does not combine a positive anchor with negated, family, or instructional context: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "present" &&
          signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it("retains a generic negated weakness keyword as contextual evidence", () => {
    const result = runEmergencyGateway("The patient denies weakness.");

    expect(result.lexicalHits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          syndrome: "acute_cerebrovascular",
          assertion: "negated",
          suppressed: true,
        }),
      ]),
    );
    expect(result.carePathway).toBe("routine_outpatient");
  });

  it.each([
    "Patient says he will kill himself tonight.",
    "Patient plans to kill himself tonight.",
  ])("detects direct imminent self-harm language: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "suicide_or_violence_risk",
      ),
    ).toBe(true);
  });

  it("preserves uncertainty from an adjacent companion clause", () => {
    const result = runEmergencyGateway("Fever. Possible meningitis.");

    expect(result.carePathway).toBe("same_day_clinician_review");
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "acute_cns_infection" &&
          signal.assertion === "uncertain",
      ),
    ).toBe(true);
  });

  it.each([
    "Possible new aphasia. Patient denies headache.",
    "Rule out cauda equina. No headache.",
  ])("does not use an unrelated next-sentence denial to erase uncertainty: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("same_day_clinician_review");
    expect(result.signals.some((signal) => signal.assertion === "uncertain")).toBe(
      true,
    );
  });

  it.each([
    "Patient's wife had status epilepticus.",
    "Patient's husband had status epilepticus.",
  ])("does not assign a spouse's emergency history to the patient: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it("does not combine a spouse's fever with the patient's confusion", () => {
    const result = runEmergencyGateway(
      "Wife had fever. Patient has new confusion today.",
    );

    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cns_infection",
      ),
    ).toBe(false);
  });

  it("does not reactivate a resolved deficit from a dated remote event", () => {
    const result = runEmergencyGateway(
      "In 2004, sudden aphasia resolved after 10 minutes.",
    );

    expect(result.carePathway).not.toBe("emergency_now");
  });

  it("detects a recently resolved deficit without requiring a numeric duration", () => {
    const result = runEmergencyGateway(
      "Sudden aphasia this morning, now resolved.",
    );

    expect(result.carePathway).toBe("emergency_now");
  });

  it.each([
    "Recurrent seizures are well controlled on levetiracetam.",
    "Patient takes apixaban and fell onto his knee today with no head strike.",
    "New stroke clinic referral for follow-up.",
  ])("does not over-fire stable disease or non-head trauma wording: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it("retains lexical provenance for acute confusion", () => {
    const result = runEmergencyGateway("Sudden confusion today.");

    expect(
      result.lexicalHits.some(
        (hit) => hit.syndrome === "altered_mental_status_or_coma",
      ),
    ).toBe(true);
  });

  it.each([
    [
      "This is the worst headache of my life.",
      "intracranial_hemorrhage_or_sah",
    ],
    ["New saddle anesthesia today.", "acute_spinal_cord_or_cauda_equina"],
    ["New urinary retention today.", "acute_spinal_cord_or_cauda_equina"],
    ["Cauda equina syndrome.", "acute_spinal_cord_or_cauda_equina"],
  ] as const)("does not miss a standalone canonical emergency phrase: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it.each([
    "Fever today; neck stiffness denied.",
    "Meningitis was ruled out today.",
  ])("recognizes a negation that follows the emergency term: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "acute_cns_infection" &&
          signal.assertion === "present",
      ),
    ).toBe(false);
  });

  it.each([
    [
      "Three episodes of aphasia today, each lasting 5 minutes, now resolved.",
      "acute_cerebrovascular",
    ],
    ["First seizure today; remains postictal.", "status_or_recurrent_seizure"],
    ["Papilledema.", "raised_intracranial_pressure"],
    ["Shunt malfunction.", "raised_intracranial_pressure"],
    [
      "Myasthenic crisis.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    [
      "Head injury with loss of consciousness today.",
      "traumatic_neurologic_deterioration",
    ],
    ["Unable to contract for safety tonight.", "suicide_or_violence_risk"],
    ["Patient is confused today.", "altered_mental_status_or_coma"],
    ["Acute delirium today.", "altered_mental_status_or_coma"],
    ["Found obtunded today.", "altered_mental_status_or_coma"],
  ] as const)("covers another design-required common wording: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it.each([
    "If sudden weakness develops, notify the clinic.",
    "Patient asks what to do if sudden weakness develops.",
    "Fever today. Confusion absent.",
    "Fever today. Neck stiffness is absent.",
  ])("does not promote hypothetical or postposed-negated language: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "present" &&
          signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it.each([
    "Patient says he is going to shoot himself tonight.",
    "Patient says he will shoot his wife tonight.",
  ])("detects an imminent firearm threat: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "suicide_or_violence_risk",
      ),
    ).toBe(true);
  });

  it.each([
    "Patient is unresponsive.",
    "Patient is in a coma.",
  ])("treats intrinsically emergent loss of consciousness as current: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).toBe("emergency_now");
  });

  it.each([
    "No acute stroke.",
    "No cauda equina syndrome.",
    "No retinal detachment.",
    "New urinary retention: absent.",
  ])("does not promote a directly negated named emergency: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it.each([
    [
      "Continuous seizure lasted 8 minutes and is now resolved.",
      "status_or_recurrent_seizure",
    ],
    [
      "Thunderclap headache this morning, now resolved.",
      "intracranial_hemorrhage_or_sah",
    ],
    ["Resolved TIA yesterday.", "acute_cerebrovascular"],
  ] as const)("does not discard a recently resolved time-critical event: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it("does not reactivate a dated deficit merely because its chart was reviewed today", () => {
    expect(
      runEmergencyGateway(
        "In 2004 sudden aphasia resolved after 10 minutes, reviewed today.",
      ).carePathway,
    ).not.toBe("emergency_now");
  });

  it.each([
    "The patient's caregiver had status epilepticus.",
    "The referring clinician had status epilepticus.",
  ])("does not assign another adult's emergency to the patient: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it("recognizes an asserted named CNS infection", () => {
    const result = runEmergencyGateway("Patient has meningitis.");

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cns_infection",
      ),
    ).toBe(true);
  });

  it("does not treat administrative new-patient language as symptom acuity", () => {
    expect(
      runEmergencyGateway("New patient referred for chronic ataxia.")
        .carePathway,
    ).not.toBe("emergency_now");
  });

  it("retains the full bounded evidence span including the phrase that supplied acuity", () => {
    const filler = "chronic background detail ".repeat(22);
    const text = `Aphasia with ${filler}and the deficit began today.`;
    const result = runEmergencyGateway(text);
    const signal = result.signals.find(
      (candidate) => candidate.syndrome === "acute_cerebrovascular",
    );

    expect(signal).toBeDefined();
    expect(signal?.evidence[0]?.quote).toContain("Aphasia");
    expect(signal?.evidence[0]?.quote).toContain("began today");
    expect(signal?.evidence[0]?.quote).toBe(text);
  });

  it.each([
    ["Sudden aphasia yesterday, now resolved.", "acute_cerebrovascular"],
    [
      "The child has sudden aphasia today.",
      "acute_cerebrovascular",
    ],
    [
      "Patient had a seizure for the first time today with a head injury.",
      "status_or_recurrent_seizure",
    ],
    ["Convulsions lasted ten minutes.", "status_or_recurrent_seizure"],
    [
      "Sudden inability to urinate today.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "Numbness in the saddle area started today.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "Both legs are getting weaker today.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "Cannot swallow saliva now.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    [
      "Trouble breathing with myasthenia gravis today.",
      "neuromuscular_respiratory_or_bulbar_failure",
    ],
    ["Suddenly went blind in one eye today.", "acute_vision_threat"],
    ["The patient will not wake up today.", "altered_mental_status_or_coma"],
    ["The patient is hard to arouse today.", "altered_mental_status_or_coma"],
    ["Patient has GCS 6 today.", "altered_mental_status_or_coma"],
    ["I am going to end my life tonight.", "suicide_or_violence_risk"],
    ["Patient plans to overdose tonight.", "suicide_or_violence_risk"],
    [
      "Patient is going to jump off a bridge tonight.",
      "suicide_or_violence_risk",
    ],
    ["Patient will shoot his neighbor tonight.", "suicide_or_violence_risk"],
  ] as const)("recognizes an additional common lay or clinician emergency phrase: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it("supports a bounded three-sentence syndrome cluster", () => {
    const result = runEmergencyGateway("Fever. Neck stiffness. Started today.");

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cns_infection",
      ),
    ).toBe(true);
  });

  it.each([
    "Her roommate had a seizure lasting 8 minutes today.",
    "Fever today. Friend had meningitis.",
    "Meningitis vaccination given today.",
    "Encephalitis antibody panel ordered today.",
    "If you notice sudden weakness, call the clinic.",
    "When sudden weakness develops, call 911.",
    "Fever today. Confusion not observed.",
    "Seizure lasted 2 minutes. Returned to baseline 8 minutes later.",
    "Head injury on apixaban two months ago; asymptomatic.",
    "Meningitis in childhood.",
    "Follow-up for chronic ataxia today.",
  ])("does not over-fire another non-patient, non-current, or contextual phrase: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(
      result.signals.some(
        (signal) =>
          signal.assertion === "present" &&
          signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it.each([
    "No meningitis.",
    "No papilledema.",
    "No shunt malfunction.",
    "No myasthenic crisis.",
    "No status epilepticus.",
    "Meningitis? No, ruled out.",
    "Cauda equina? No.",
  ])("does not promote another directly negated named crisis: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it("recognizes a single recently resolved focal episode", () => {
    expect(
      runEmergencyGateway("One episode of aphasia today, now resolved.")
        .carePathway,
    ).toBe("emergency_now");
  });

  it.each([
    ["Patient is actively seizing for 8 minutes.", "status_or_recurrent_seizure"],
    ["Convulsing continuously for 8 minutes.", "status_or_recurrent_seizure"],
    ["His speech became garbled suddenly today.", "acute_cerebrovascular"],
    ["He suddenly cannot move his left arm.", "acute_cerebrovascular"],
    [
      "The left side of her face started drooping today.",
      "acute_cerebrovascular",
    ],
    ["Sudden numbness on the right side today.", "acute_cerebrovascular"],
    ["Temp 103 F with neck stiffness today.", "acute_cns_infection"],
    [
      "On a blood thinner after a head strike today.",
      "traumatic_neurologic_deterioration",
    ],
    ["Head strike with LOC today.", "traumatic_neurologic_deterioration"],
    [
      "Twenty weeks gestation with a new headache today.",
      "intracranial_hemorrhage_or_sah",
    ],
    ["Blocked VP shunt with vomiting today.", "raised_intracranial_pressure"],
    ["Optic disc edema with vomiting today.", "raised_intracranial_pressure"],
    ["Acute encephalopathy today.", "altered_mental_status_or_coma"],
    ["Active SI with intent tonight.", "suicide_or_violence_risk"],
    ["Active HI with a plan tonight.", "suicide_or_violence_risk"],
    ["Patient says he intends suicide tonight.", "suicide_or_violence_risk"],
    [
      "Patient plans to take all of her pills tonight.",
      "suicide_or_violence_risk",
    ],
  ] as const)("recognizes another high-risk lay or abbreviated phrase: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(
      true,
    );
  });

  it.each([
    "Problem list: cauda equina syndrome.",
    "Problem list: status epilepticus.",
    "Stroke warning signs include sudden weakness and aphasia.",
  ])("does not promote a problem-list or warning-sign phrase: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it.each([
    "Active problems: sudden aphasia and right facial droop beginning 20 minutes ago.",
    "Problem list: patient is currently seizing without recovery.",
    "After a negative screening test the patient developed sudden aphasia and facial droop today.",
  ])("lets an explicit current patient emergency override a contextual heading or test clause: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).toBe("emergency_now");
  });

  it.each([
    "Despite no headache, sudden aphasia began today.",
    "No fever, sudden aphasia started today.",
  ])("does not let a different negated feature suppress a current emergency: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "acute_cerebrovascular",
      ),
    ).toBe(true);
  });

  it.each([
    "Remote seizure history, patient has GCS 6 today.",
    "Remote stroke history, patient is unresponsive today.",
    "Patient has GCS of 6 today.",
    "Patient cannot be awakened today.",
    "Patient is stuporous today.",
  ])("recognizes a current severe consciousness finding despite wording or remote history: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === "altered_mental_status_or_coma",
      ),
    ).toBe(true);
  });

  it.each([
    ["Fever. Possible neck stiffness today.", "acute_cns_infection"],
    [
      "New headache today. Possible anticoagulation.",
      "intracranial_hemorrhage_or_sah",
    ],
  ] as const)("preserves uncertainty from a separate companion sentence: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("same_day_clinician_review");
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === syndrome && signal.assertion === "uncertain",
      ),
    ).toBe(true);
  });

  it.each([
    "The witness had status epilepticus.",
    "The patient's cousin had status epilepticus.",
  ])("does not attribute another person's emergency to the patient: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).not.toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.experiencer === "patient" && signal.action === "emergency_now",
      ),
    ).toBe(false);
  });

  it.each([
    "Seizure occurred 8 minutes after arrival.",
    "Seizure began 8 minutes after medication.",
  ])("does not mistake event timing for seizure duration: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it.each([
    "No acute SAH.",
    "No subarachnoid hemorrhage today.",
    "No retinal artery occlusion.",
    "No optic nerve compression.",
  ])("does not promote another directly negated emergency diagnosis: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it.each([
    ["History of hypertension, patient has papilledema today.", "raised_intracranial_pressure"],
    ["History of epilepsy, patient had a head strike on warfarin today.", "traumatic_neurologic_deterioration"],
    ["History of cancer, patient has severe new back pain today.", "acute_spinal_cord_or_cauda_equina"],
    ["History of diabetes, patient has retinal artery occlusion today.", "acute_vision_threat"],
    ["Patient is seizing now.", "status_or_recurrent_seizure"],
    ["Three seizures in one hour without regaining consciousness.", "status_or_recurrent_seizure"],
    ["Seizure lasted approximately eight minutes.", "status_or_recurrent_seizure"],
    ["Seizure lasted 5-10 minutes.", "status_or_recurrent_seizure"],
    ["Patient is having a stroke now.", "acute_cerebrovascular"],
    ["Acute intracranial hemorrhage today.", "intracranial_hemorrhage_or_sah"],
    ["CT shows acute intraparenchymal hemorrhage today.", "intracranial_hemorrhage_or_sah"],
    ["Patient with myasthenia gravis cannot clear secretions.", "neuromuscular_respiratory_or_bulbar_failure"],
    ["Patient with GBS is in respiratory failure.", "neuromuscular_respiratory_or_bulbar_failure"],
    ["Patient woke up and cannot see out of the left eye.", "acute_vision_threat"],
    ["Patient has current SI with plan and intent.", "suicide_or_violence_risk"],
    ["Head injury followed by a seizure today.", "traumatic_neurologic_deterioration"],
    ["Temp 39°C with neck stiffness today.", "acute_cns_infection"],
    ["Sudden aphasia two days ago and still present.", "acute_cerebrovascular"],
    ["Sudden left arm weakness 2 days ago and ongoing.", "acute_cerebrovascular"],
    ["No weakness until today, when sudden left arm weakness began.", "acute_cerebrovascular"],
    ["The patient no longer denies weakness and now has left arm weakness.", "acute_cerebrovascular"],
  ] as const)("recognizes another adversarially identified current emergency: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(result.signals.some((signal) => signal.syndrome === syndrome)).toBe(true);
  });

  it.each([
    "Active SI without plan or intent.",
    "Patient has active SI but denies intent.",
    "Head strike today with no loss of consciousness.",
    "Head strike today; no LOC.",
    "No urinary retention. New low back pain today.",
    "No saddle numbness. New low back pain today.",
    "Patient has seizure disorder and ongoing physical therapy.",
    "Patient has an active license and a seizure disorder.",
    "Seizure disorder remains on active problem list.",
    "No optic disc edema.",
    "No blocked VP shunt.",
    "Meningitis PCR negative.",
    "Encephalitis panel negative.",
  ])("does not manufacture an emergency from another adversarial negative/context case: %s", (text) => {
    expect(runEmergencyGateway(text).carePathway).not.toBe("emergency_now");
  });

  it.each([
    ["Stroke has not been ruled out today.", "acute_cerebrovascular"],
    ["SAH cannot be excluded.", "intracranial_hemorrhage_or_sah"],
    ["Cauda equina cannot be ruled out.", "acute_spinal_cord_or_cauda_equina"],
    ["Meningitis cannot be excluded.", "acute_cns_infection"],
  ] as const)("treats unresolved exclusion as uncertain same-day review: %s", (text, syndrome) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("same_day_clinician_review");
    expect(
      result.signals.some(
        (signal) => signal.syndrome === syndrome && signal.assertion === "uncertain",
      ),
    ).toBe(true);
  });

  it.each(["", "   \n\t"])("fails closed on empty referral evidence: %j", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.status).toBe("failed");
    expect(result.carePathway).toBe("undetermined");
    expect(result.reviewRequirement).toBe("immediate_clinician_review");
  });

  it("fails closed on low-confidence OCR that may contain corrupted emergency terms", () => {
    const result = runEmergencyGateway(
      "Sudden facial dr00p and aphasla today.",
      { extractionMethod: "ocr", extractionConfidence: 0.12 },
    );

    expect(result.status).toBe("failed");
    expect(result.carePathway).toBe("undetermined");
    expect(result.reviewRequirement).toBe("immediate_clinician_review");
  });

  it.each([
    { packetId: "", documentId: "document-1", pageNumber: 1 },
    { packetId: "packet-1", documentId: "", pageNumber: 1 },
    { packetId: "packet-1", documentId: "document-1", pageNumber: -1 },
    { extractionMethod: "ocr" as const, extractionConfidence: 1.4 },
  ])("fails closed instead of copying invalid provenance: %#", (source) => {
    const result = runEmergencyGateway("Sudden aphasia today.", source);

    expect(result.status).toBe("failed");
    expect(result.carePathway).toBe("undetermined");
    expect(result.signals).toHaveLength(0);
  });

  it.each([
    [
      "Emergency evaluation ruled out cauda equina syndrome. There is explicitly no urinary retention, no saddle numbness, and no new leg weakness.",
      "acute_spinal_cord_or_cauda_equina",
    ],
    [
      "Chronic stable vision loss from a remote eye injury. No sudden change, no new blindness, and vision is at baseline.",
      "acute_vision_threat",
    ],
    [
      "Chronic stable confusion related to established dementia. Family confirms this is the patient's baseline with no acute or sudden change.",
      "altered_mental_status_or_coma",
    ],
  ] as const)(
    "does not alert on an explicit ruled-out or chronic-stable hard negative: %s",
    (text, syndrome) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).toBe("routine_outpatient");
      expect(
        result.signals.some(
          (signal) =>
            signal.syndrome === syndrome &&
            signal.assertion === "present" &&
            signal.action === "emergency_now",
        ),
      ).toBe(false);
    },
  );

  it.each([
    [
      "Cauda equina cannot be ruled out; current bladder and saddle symptoms are unknown.",
      "same_day_clinician_review",
    ],
    [
      "The patient has sudden new blindness in the left eye now.",
      "emergency_now",
    ],
    [
      "The patient has sudden new confusion today and is not making sense.",
      "emergency_now",
    ],
  ] as const)(
    "preserves uncertain or current time-critical counterparts: %s",
    (text, expectedPathway) => {
      expect(runEmergencyGateway(text).carePathway).toBe(expectedPathway);
    },
  );

  it("is deterministic for identical input", () => {
    const text = "Sudden painful loss of vision in the left eye this morning.";
    const source = {
      packetId: "packet-1",
      documentId: "document-1",
      pageNumber: 87,
    };

    expect(runEmergencyGateway(text, source)).toEqual(
      runEmergencyGateway(text, source),
    );
  });
});

/**
 * Status / acute-repetitive-seizure under-triage regression.
 *
 * The gateway fired on literal "status epilepticus" and durations >5 min but
 * missed two textbook seizure emergencies: (1) status by recurrence — seizures
 * "without full/complete recovery between events" (a qualifier like "full"
 * previously broke the without-recovery adjacency in SEIZURE_EMERGENCY), and
 * (2) acute repetitive seizures / seizure cluster phrasing, which was absent
 * from RECURRENT_SEIZURE entirely. Widened both, over-triage-safe: the cluster
 * / multiple-seizure terms stay on the recurrent path (gated by
 * !STABLE_SEIZURE_CONTEXT and an acute/uncertain marker in the same segment),
 * so a well-controlled history or a seizure-cluster PMH line in a separate
 * sentence still does not fire.
 */
describe("runEmergencyGateway — status / acute-repetitive-seizure recognition", () => {
  it.each([
    "Patient with recurrent seizures without full recovery between events.",
    "Recurrent convulsions with no complete recovery between episodes.",
    "Three seizures today, not returning to baseline in between.",
    "Patient presents today with a seizure cluster.",
    "Cluster of seizures today, brought in by family.",
    "Now having a cluster of tonic-clonic seizures.",
    "Acute repetitive seizures over the last few hours.",
    "Two seizures in the past hour, now sleepy.",
    "Multiple seizures today without full recovery in between.",
  ])("locks a status / acute-repetitive seizure to emergency_now: %s", (text) => {
    const result = runEmergencyGateway(text);

    expect(result.carePathway).toBe("emergency_now");
    expect(
      result.signals.some(
        (signal) =>
          signal.syndrome === "status_or_recurrent_seizure" &&
          signal.assertion === "present" &&
          signal.action === "emergency_now",
      ),
    ).toBe(true);
  });

  it.each([
    "History of seizure clusters, well controlled on levetiracetam, no recent seizures.",
    "Chronic epilepsy with occasional seizure clusters, currently at baseline.",
    "Remote history of recurrent seizures, seizure-free for five years.",
    "Single seizure; denies any recurrent seizures or clusters.",
    "Chief complaint: acute low back pain today. PMH: seizure clusters in the past.",
    "Presents today with migraine. History of multiple seizures years ago, now stable.",
  ])(
    "does not treat a stable, historical, negated, or separate-sentence PMH cluster as a seizure emergency: %s",
    (text) => {
      const result = runEmergencyGateway(text);

      expect(result.carePathway).not.toBe("emergency_now");
    },
  );
});
