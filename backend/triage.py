import anthropic
from anthropic.types import TextBlock
import os
import json
import uuid
import time
import logging
from datetime import datetime, timezone
from database import get_db

SYSTEM_PROMPT = """You are a Chief Compliance Officer at NSE (National Stock \
Exchange of India) with 20 years of experience in market \
surveillance and SEBI regulatory proceedings. You have \
testified as an expert witness in multiple market \
manipulation cases. You analyze trade alerts and produce \
verdicts that can be submitted as evidence to SEBI. \
Respond ONLY with valid JSON. No text outside the JSON."""


def build_prompt(alert):
    return f"""Alert ID: {alert['alert_id']}
Timestamp: {alert['detected_at']} UTC
Trader: {alert['trader_id']}
Instrument: {alert['instrument']} (NSE: {alert['instrument']})
Severity: {alert['severity']}
Detected Pattern: {alert['pattern_type']}
Evidence: {alert['evidence_summary']}
Stats: cancel_ratio={alert['cancel_ratio']}, sigma={alert['sigma']}

The problem statement example output format for reference:
AI Triage verdict should include:
- What the pattern means mechanically
- Specific numbers: cancellation ratio, time-to-cancel median, anomaly vs baseline in sigma
- Clear ESCALATE or DISMISS verdict
- Confidence percentage
- False positive probability

Respond with ONLY this JSON:
{{
  "verdict": "ESCALATE",
  "confidence": 91,
  "false_positive_probability": 9,
  "risk_level": "HIGH",
  "rationale": "4-5 sentences: explain the pattern mechanically, cite the specific numbers cancel_ratio%, median cancel ms, sigma anomaly vs baseline, why this indicates manipulation vs legitimate trading.",
  "simple_explanation": "1-2 sentences in plain English that a non-trader board member can understand.",
  "recommended_action": "Specific action: e.g. Freeze account, File STR with FIU-IND, Request NSE audit log, Assign to Surveillance Desk L2.",
  "regulatory_reference": "SEBI regulation: e.g. SEBI PFUTP Regulations 2003, Regulation 4(2)(a) - Manipulative fraudulent and unfair trade practices."
}}
Replace all example values with your actual assessment.
verdict must be ESCALATE or DISMISS.
risk_level must be CRITICAL, HIGH, MEDIUM, or LOW."""


def triage_alert(alert):
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    start_ms = int(time.time() * 1000)
    response = client.messages.create(
        model="claude-sonnet-4-5-20251001",
        max_tokens=600,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(alert)}],
    )
    processing_time_ms = int(time.time() * 1000) - start_ms

    block = response.content[0]
    if not isinstance(block, TextBlock):
        raise ValueError(f"Claude returned unexpected content type: {type(block)}")
    raw = block.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        result = json.loads(raw.strip())
    except json.JSONDecodeError as e:
        logging.error(f"Claude returned non-JSON for {alert['alert_id']}: {raw[:300]}")
        raise ValueError(f"AI returned invalid JSON: {e}")

    triage_id = "TRG-" + str(uuid.uuid4())[:8].upper()
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO triage_results
          (triage_id, alert_id, verdict, confidence, false_positive_probability,
           rationale, simple_explanation, recommended_action, risk_level,
           regulatory_reference, processing_time_ms, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            triage_id,
            alert["alert_id"],
            result.get("verdict"),
            result.get("confidence"),
            result.get("false_positive_probability"),
            result.get("rationale"),
            result.get("simple_explanation"),
            result.get("recommended_action"),
            result.get("risk_level"),
            result.get("regulatory_reference"),
            processing_time_ms,
            datetime.now(timezone.utc).isoformat(),
        ),
    )

    new_status = "ESCALATED" if result.get("verdict") == "ESCALATE" else "DISMISSED"
    conn.execute(
        "UPDATE alerts SET status=? WHERE alert_id=?",
        (new_status, alert["alert_id"]),
    )
    conn.commit()
    conn.close()

    result["triage_id"] = triage_id
    result["alert_id"] = alert["alert_id"]
    result["processing_time_ms"] = processing_time_ms
    return result
