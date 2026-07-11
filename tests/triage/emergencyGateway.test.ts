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

  it.each(["Neurologic symptoms are stable at the routine follow-up visit.", ""])(
    "keeps ordinary or empty text on the locked routine pathway: %s",
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
