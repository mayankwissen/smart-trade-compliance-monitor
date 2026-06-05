import anthropic
import os
import json
import uuid
import logging
from datetime import datetime
from database import get_db

SYSTEM_PROMPT = """You are a trade surveillance compliance analyst at a \
financial institution. Analyze the alert and respond ONLY with a valid \
JSON object. No markdown, no explanation, no text outside the JSON."""


def build_prompt(alert):
    return f"""Alert ID: {alert['alert_id']}
Pattern: {alert['pattern_type']}
Trader: {alert['trader_id']}
Instrument: {alert['instrument']}
Severity: {alert['severity']}
Evidence: {alert['evidence_summary']}
Stats: cancel_ratio={alert['cancel_ratio']}, sigma={alert['sigma']}

Respond with ONLY this JSON object:
{{
  "verdict": "ESCALATE",
  "confidence": 91,
  "false_positive_probability": 9,
  "rationale": "2-3 sentence explanation of why this is or is not genuine misconduct."
}}
Replace the example values with your actual assessment."""


def triage_alert(alert):
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(alert)}],
    )
    raw = response.content[0].text.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    result = json.loads(raw.strip())

    triage_id = "TRG-" + str(uuid.uuid4())[:8].upper()
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO triage_results
          (triage_id, alert_id, verdict, confidence, false_positive_probability,
           rationale, created_at) VALUES (?,?,?,?,?,?,?)""",
        (
            triage_id,
            alert["alert_id"],
            result["verdict"],
            result["confidence"],
            result["false_positive_probability"],
            result["rationale"],
            datetime.utcnow().isoformat(),
        ),
    )

    new_status = "ESCALATED" if result["verdict"] == "ESCALATE" else "DISMISSED"
    conn.execute(
        "UPDATE alerts SET status=? WHERE alert_id=?",
        (new_status, alert["alert_id"]),
    )
    conn.commit()
    conn.close()

    result["triage_id"] = triage_id
    result["alert_id"] = alert["alert_id"]
    return result
