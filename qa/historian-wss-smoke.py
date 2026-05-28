#!/usr/bin/env python3
"""
WSS smoke for the deployed AI Historian (no browser, no audio).

Pulls an ephemeral key from app.neuroplans.app/api/ai/historian/session,
opens wss://api.openai.com/v1/realtime, sends a scripted patient via
text-mode input, watches the model's tool calls + transcript, and
dispatches each tool call to its real deployed endpoint.

This catches things voice testing can't:
  - silently rejected session.update payloads
  - tool dispatch shape bugs
  - prompt obedience (does the model call the tools when expected?)

Usage:
    python3 qa/historian-wss-smoke.py                       # default = walter
    python3 qa/historian-wss-smoke.py --persona maya
    python3 qa/historian-wss-smoke.py --base https://app.neuroplans.app

Output: full model transcript + tool call log + DB row inspection.
"""

import argparse
import asyncio
import json
import sys
import uuid

try:
    import httpx
    import websockets
except ImportError:
    print("Install deps: pip3 install httpx websockets", file=sys.stderr)
    sys.exit(1)

# ─── Patient scripts ────────────────────────────────────────────────────────
# Each entry is a sequence of patient turns. The "*_with_localizer" variants
# also inject synthetic Localizer pushes at specified turn indices to verify
# the push channel.

PERSONAS = {
    # Default Walter — neurology focus, exercises scale_step + query_evidence
    # under Localizer guidance. Avoids "RIGHT NOW" safety language.
    "walter": {
        "referral_reason": "progressive bilateral hand tremor in 72M (Walter Henderson demo)",
        "patient_context": "72M, retired machinist",
        "turns": [
            "Hi. My wife made me come in. I've had this tremor in both my hands for two or three years and she says it's getting worse.",
            "It's worse when I'm reaching for something — like my coffee cup or buttoning a shirt. Not when my hands are resting.",
            "My dad had the same tremor his whole life. I'm seventy-two, retired machinist.",
            "Lately I've been forgetting words mid-sentence too. My wife is more worried about that than the tremor honestly.",
            "I haven't fallen, but my gait feels less sure. Mostly slow to turn around.",
            "No serious problems with mood — maybe a little frustrated. I sleep okay. No new headaches.",
            "One last thing. My pharmacist mentioned my amlodipine might interact with the new memantine my GP started. Is that something the neurologist would want to know about?",
        ],
        # Inject after the patient turn at this 0-based index (i.e., before
        # sending the next patient turn). Each push is a dict matching the
        # shape produced by /api/ai/historian/localizer's push_payload.
        "localizer_pushes": {
            3: {
                "top_differentials": ["essential tremor (medium)", "early parkinsonism (medium)", "vascular cognitive impairment (low)"],
                "suggested_next_question": "Has the patient noticed REM-sleep behavior disorder symptoms (acting out dreams)?",
                "suggested_scale_id": "mini_cog",
            },
            6: {
                "top_differentials": ["Lewy body dementia (medium)", "essential tremor + MCI (medium)", "Parkinson disease dementia (low)"],
                "suggested_next_question": "Has the patient or wife noticed visual hallucinations or fluctuating attention?",
                "suggested_scale_id": "mini_cog",
            },
        },
    },
    # Maya — migraine with aura. Tests scale_step (MIDAS/HIT-6).
    "maya": {
        "referral_reason": "episodic migraine with aura in 34F",
        "patient_context": "34F, software engineer",
        "turns": [
            "Hi, I've been getting these headaches a few times a month for the last year and they're really disrupting my work.",
            "They're throbbing, on the right side mostly, and I get nauseous. Bright lights make it worse.",
            "Sometimes about twenty minutes before the headache starts I see these zigzag patterns in my vision. They go away when the headache hits.",
            "It's been getting worse — last month I had to leave work three times. I'm worried about my job.",
            "My mom had migraines too. I take Tylenol but it doesn't really help.",
            "I haven't tried any prescription medications. Are there better options?",
        ],
        "localizer_pushes": {
            3: {
                "top_differentials": ["migraine with aura (high)", "tension-type headache (low)", "cluster headache (low)"],
                "suggested_next_question": "What is the impact on the patient's daily function and work?",
                "suggested_scale_id": "midas",
            },
        },
    },
}


def log(msg):
    print(msg, flush=True)


async def fetch_ephemeral_key(base: str, persona: dict, consult_id: str):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/api/ai/historian/session", json={
            "sessionType": "new_patient",
            "referralReason": persona["referral_reason"],
            "patientContext": persona["patient_context"],
            "consult_id": consult_id,
        })
        r.raise_for_status()
        data = r.json()
        log(f"✓ Session created: model={data['model']} vad={data['turn_detection_mode']} key={data['ephemeralKey'][:20]}...")
        return data["ephemeralKey"], data["model"], data.get("base_instructions", "")


async def call_evidence_query(base: str, args: dict):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/api/ai/historian/evidence-query", json=args)
        return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text})


async def call_scale_step(base: str, consult_id: str, args: dict):
    args = {**args, "consult_id": consult_id}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/api/ai/historian/scales?action=step", json=args)
        return r.status_code, r.json()


async def play(base: str, persona_name: str):
    persona = PERSONAS.get(persona_name)
    if not persona:
        log(f"Unknown persona: {persona_name}. Available: {list(PERSONAS.keys())}")
        sys.exit(1)

    consult_id = str(uuid.uuid4()).upper()
    log(f"════════════════════════════════════════════════")
    log(f" Historian WSS smoke — persona={persona_name}, base={base}")
    log(f" Consult UUID: {consult_id}")
    log(f"════════════════════════════════════════════════")

    key, model, base_instructions = await fetch_ephemeral_key(base, persona, consult_id)
    if not base_instructions:
        log("⚠ Server returned no base_instructions — Localizer push will be skipped")

    url = f"wss://api.openai.com/v1/realtime?model={model}"
    headers = [("Authorization", f"Bearer {key}")]
    log(f"\n→ Connecting to {url}")

    tool_calls_made = []
    patient_idx = 0
    pending_tool_args = {}

    async with websockets.connect(url, additional_headers=headers, max_size=2**24) as ws:
        log("✓ WSS connected\n")

        async def push_localizer(turn_count: int, payload: dict):
            if not base_instructions:
                return
            delta = "\n\n[LATEST LOCALIZER PUSH @ turn " + str(turn_count) + "]\n"
            delta += "- Top differentials: " + ", ".join(payload.get("top_differentials", [])) + "\n"
            delta += "- Suggested next question: " + (payload.get("suggested_next_question") or "(none)") + "\n"
            delta += "- Suggested scale to consider: " + (payload.get("suggested_scale_id") or "(none)") + "\n"
            log(f"\n📡 LOCALIZER PUSH (turn {turn_count}): scale={payload.get('suggested_scale_id')}")
            await ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    # MUST include type:'realtime' per OpenAI Realtime API —
                    # otherwise the push is silently rejected with HTTP 400.
                    "type": "realtime",
                    "instructions": base_instructions + delta,
                },
            }))

        async def send_next_patient_turn():
            nonlocal patient_idx
            if patient_idx >= len(persona["turns"]):
                return False
            text = persona["turns"][patient_idx]
            log(f"\n👤 PATIENT (turn {patient_idx + 1}): {text}")

            push = persona.get("localizer_pushes", {}).get(patient_idx)
            if push:
                await push_localizer(patient_idx, push)

            await ws.send(json.dumps({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": text}],
                },
            }))
            await ws.send(json.dumps({"type": "response.create"}))
            patient_idx += 1
            return True

        await send_next_patient_turn()

        async for raw in ws:
            try:
                event = json.loads(raw)
            except Exception:
                continue
            etype = event.get("type", "")

            if etype == "response.created":
                sys.stdout.write("\n🤖 MODEL: ")
                sys.stdout.flush()
            elif etype == "response.output_text.delta":
                sys.stdout.write(event.get("delta", ""))
                sys.stdout.flush()
            elif etype == "response.output_audio_transcript.delta":
                sys.stdout.write(event.get("delta", ""))
                sys.stdout.flush()
            elif etype == "response.output_item.added":
                item = event.get("item", {})
                if item.get("type") == "function_call":
                    pending_tool_args[item["call_id"]] = {"name": item["name"], "args_buf": ""}
                    log(f"\n🔧 TOOL CALL START: {item['name']} (call_id={item['call_id'][:12]}...)")
            elif etype == "response.function_call_arguments.delta":
                cid = event.get("call_id")
                if cid in pending_tool_args:
                    pending_tool_args[cid]["args_buf"] += event.get("delta", "")
            elif etype == "response.function_call_arguments.done":
                cid = event.get("call_id")
                if cid in pending_tool_args:
                    name = pending_tool_args[cid]["name"]
                    args_str = pending_tool_args[cid]["args_buf"]
                    try:
                        args = json.loads(args_str)
                    except Exception:
                        args = {"_raw": args_str}
                    log(f"\n🔧 TOOL ARGS: {name}({json.dumps(args)[:250]})")
                    tool_calls_made.append({"name": name, "args": args})

                    if name == "query_evidence":
                        status, result = await call_evidence_query(base, args)
                        log(f"   → /api/ai/historian/evidence-query HTTP {status}")
                        log(f"   → {json.dumps(result)[:200]}")
                    elif name == "scale_step":
                        status, result = await call_scale_step(base, consult_id, args)
                        log(f"   → /api/ai/historian/scales?action=step HTTP {status}")
                        log(f"   → {json.dumps(result)[:300]}")
                    elif name == "save_interview_output":
                        log(f"   → save_interview_output called with HPI: {args.get('hpi','')[:150]}")
                        result = {"success": True, "noted": True}
                        status = 200
                    else:
                        log(f"   → unknown tool: {name}")
                        result = {"error": "unknown tool"}

                    await ws.send(json.dumps({
                        "type": "conversation.item.create",
                        "item": {
                            "type": "function_call_output",
                            "call_id": cid,
                            "output": json.dumps(result),
                        },
                    }))
                    await ws.send(json.dumps({"type": "response.create"}))
                    del pending_tool_args[cid]
            elif etype == "response.done":
                # Brief pause to let trailing tool events land before next turn
                await asyncio.sleep(0.5)
                if patient_idx < len(persona["turns"]):
                    await send_next_patient_turn()
                else:
                    log("\n\n✓ All patient turns sent — short wait for trailing output.")
                    try:
                        await asyncio.wait_for(asyncio.sleep(3), timeout=4)
                    except Exception:
                        pass
                    break
            elif etype == "error":
                log(f"\n⚠ Server error: {event.get('error', event)}")

        log("\n\n══════════════════════════════════════════════")
        log(f" Smoke complete — persona={persona_name}")
        log(f" Tool calls made: {len(tool_calls_made)}")
        for tc in tool_calls_made:
            log(f"  - {tc['name']}({json.dumps(tc['args'])[:120]})")
        log(f" Consult ID: {consult_id}")
        log(f" Inspect scale_results: psql ops_amplehtml -c \"SELECT scale_id,status,total_score FROM scale_results WHERE consult_id='{consult_id}'\"")
        log("══════════════════════════════════════════════")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="https://app.neuroplans.app",
                        help="Base URL of the deployed historian (default: %(default)s)")
    parser.add_argument("--persona", default="walter",
                        choices=list(PERSONAS.keys()),
                        help="Which scripted patient to play (default: walter)")
    args = parser.parse_args()
    asyncio.run(play(args.base, args.persona))


if __name__ == "__main__":
    main()
