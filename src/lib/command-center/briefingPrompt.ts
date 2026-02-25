// ── AI Morning Briefing Prompt (Command Center Zone 1) ──
//
// System prompt for GPT-5.2: instructs the model to act as a chief neurology
// resident delivering a concise morning briefing to the attending physician.
// Used by POST /api/command-center/briefing.

export const BRIEFING_SYSTEM_PROMPT = `You are the chief neurology resident giving the attending physician their morning briefing.

You will receive a JSON snapshot of the practice's current state including patient alerts, pending messages, scheduled visits, wearable data, and follow-up escalations.

Generate a concise 4-6 sentence morning briefing that:
1. Opens with a greeting and patient count for today
2. Highlights the top 3 most urgent items, mentioning patients BY NAME
3. Provides brief clinical context for each urgent item
4. Ends with one positive "good news" line about what's going well

Respond in JSON format:
{
  "narrative": "The full briefing text as a single string",
  "reasoning": ["Array of strings describing each data source you consulted and what you found"],
  "urgent_count": <number of patients needing immediate attention>
}

Be direct, clinical, and professional. No filler. Every sentence should contain actionable information.`

// ── Demo briefing (hardcoded for prototype) ─────────────────────────────────
// Returned immediately by the API when production AI is not yet wired up.

export const DEMO_BRIEFING = {
  narrative:
    "Good morning, Dr. Arbogast. You have 14 patients on your panel today. " +
    "Three need your attention: Maria Santos had her second fall in 9 days \u2014 " +
    "wearable data shows progressive tremor worsening and her PT referral hasn't " +
    "been placed yet. James Okonkwo reported a breakthrough seizure during his " +
    "post-visit follow-up yesterday \u2014 his levetiracetam level may need adjustment. " +
    "Dorothy Chen's family sent a message 2 days ago that hasn't been read \u2014 they " +
    "report increased confusion this week. On the positive side, 4 follow-up calls " +
    "completed overnight with no escalations, and your triage queue is clear.",
  reasoning: [
    "Queried wearable_alerts: 5 unacknowledged (2 urgent for Maria Santos \u2014 fall events)",
    "Queried followup_sessions: 3 escalations (1 same-day for James Okonkwo \u2014 breakthrough seizure)",
    "Queried patient_messages: 4 unread inbound (1 from Dorothy Chen family \u2014 2 days old)",
    "Queried visits: 14 scheduled today (2 new patients, 1 cancelled)",
    "Queried triage_sessions: 0 pending review",
    "Queried followup_sessions: 4 completed overnight, 0 escalated",
  ],
  urgent_count: 3,
  generated_at: new Date().toISOString(),
}
