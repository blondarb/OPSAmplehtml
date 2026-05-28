# AI Historian WSS Smoke Test

## What it does

`historian-wss-smoke.py` runs a fully scripted patient conversation against
the deployed `/consult` AI Historian via **WebSocket transport** (text input,
not audio). It pulls a real ephemeral key from the deployed
`/api/ai/historian/session`, opens
`wss://api.openai.com/v1/realtime?model=gpt-realtime-2`, then:

1. Sends scripted patient turns as `conversation.item.create` text events
2. Watches the model's response stream + tool calls
3. When the model calls `query_evidence` / `scale_step` / `save_interview_output`,
   dispatches each call to the real deployed endpoint and feeds the result back
4. Optionally injects synthetic Localizer pushes via `session.update`
   (replicates what Phase 5's `pushLocalizerContext` does in production)
5. Prints the full transcript + tool-call log + DB-row inspection query

This catches things voice-only testing can't:

- Silently rejected `session.update` payloads (caught the `session.type`
  missing-parameter bug on 2026-05-27 that was breaking the Localizer push in
  production)
- Tool-dispatch shape bugs (verified the full PHQ-9 paginated flow)
- Prompt obedience — does the model call the tools when the prompt + Localizer
  push say it should?

## Running

```bash
# Default: Walter persona (essential tremor → MCI workup)
python3 qa/historian-wss-smoke.py

# Or pick a different scripted patient
python3 qa/historian-wss-smoke.py --persona maya

# Against a different deployment (e.g., a preview branch URL)
python3 qa/historian-wss-smoke.py --base https://main.dev-amplifyapp.com
```

Deps: `pip3 install httpx websockets` (one-time)

## What to look for in the output

| Signal | Healthy | Unhealthy |
|---|---|---|
| `✓ Session created` line | model + vad + ephemeralKey present | any missing field |
| `📡 LOCALIZER PUSH` events | followed by model pivoting to suggested question/scale | followed by `⚠ Server error: 'session.type' missing` |
| `🔧 TOOL CALL START: scale_step` | appears within 1-2 turns of MoCA/PHQ-9 Localizer push | never appears despite push |
| `🔧 TOOL CALL START: query_evidence` | appears on red-flag patient mentions OR specific clinical questions | never appears |
| `🔧 TOOL CALL START: save_interview_output` | appears at ~15-25 turns OR active emergency | appears early (turn 3-5) on past red flag |
| Scale items recited | verbatim from `src/lib/consult/scales/scale-library.ts` | paraphrased or skipped |

## Adding a new persona

Append a new entry to `PERSONAS` in `historian-wss-smoke.py`:

```python
"newpersona_id": {
    "referral_reason": "...",
    "patient_context": "...",
    "turns": ["...", "...", ...],
    "localizer_pushes": {
        3: {  # inject at turn 3 (before sending the 4th patient turn)
            "top_differentials": ["..."],
            "suggested_next_question": "...",
            "suggested_scale_id": "moca",  # or phq9/gad7/midas/hit6/ess/...
        },
    },
}
```

Then run: `python3 qa/historian-wss-smoke.py --persona newpersona_id`

## When to run

- **Before merging any historian-related PR** — quick regression check
- **After OpenAI Realtime API changes** — catches breaking session schema changes
  before they hit users (e.g., the `session.type` requirement on session.update)
- **After tuning `historianPrompts.ts`** — verify the tools still get called
- **Before live customer demos** — confidence check on the full stack

## What it does NOT test

- Voice synthesis / audio path (it uses text input)
- WebRTC SDP exchange (it uses WebSocket transport, not the production WebRTC path)
- Browser WebRTC permissions / mic capture
- Cognito auth on `query_evidence` (the smoke gets HTTP 401 since it has no
  Cognito session — verifies the auth gate works but doesn't exercise the
  end-to-end success path)

For those, use a browser on the deployed site after merge.
