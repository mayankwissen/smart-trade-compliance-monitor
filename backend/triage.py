import anthropic
from anthropic.types import TextBlock
import os
import json
import re
import uuid
import time
import logging
from datetime import datetime, timezone
from database import get_db


def _parse_claude_json(raw):
    """Robustly parse JSON from Claude, handling code fences and literal
    newlines inside string values (which break strict json.loads)."""
    raw = raw.strip()
    # Strip code fences
    if raw.startswith("```"):
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    # Extract the outermost JSON object if extra prose surrounds it
    first = raw.find("{")
    last = raw.rfind("}")
    if first != -1 and last != -1 and last > first:
        raw = raw[first:last + 1]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Escape raw newlines/tabs/carriage returns that appear inside string
        # literals — walk the string tracking whether we're inside quotes.
        out = []
        in_str = False
        escaped = False
        for ch in raw:
            if escaped:
                out.append(ch)
                escaped = False
                continue
            if ch == "\\":
                out.append(ch)
                escaped = True
                continue
            if ch == '"':
                in_str = not in_str
                out.append(ch)
                continue
            if in_str and ch == "\n":
                out.append("\\n")
                continue
            if in_str and ch == "\r":
                out.append("\\r")
                continue
            if in_str and ch == "\t":
                out.append("\\t")
                continue
            out.append(ch)
        return json.loads("".join(out))

SYSTEM_PROMPT = """You are a Chief Compliance Officer at NSE (National Stock \
Exchange of India) with 20 years of experience in market \
surveillance and SEBI regulatory proceedings. You have \
testified as an expert witness in multiple market \
manipulation cases. You analyze trade alerts and produce \
verdicts that can be submitted as evidence to SEBI.

Your analysis is informed by established academic research:

KEY RESEARCH FINDINGS:
1. Comerton-Forde & Putniņš (2015): Layering detected via cancel ratio >65-70%, \
sub-500ms cancellations (algorithmic), and price impact before execution.
2. Cumming et al. (2018): Spoofing — order-to-trade ratio >5:1, large orders at \
best bid/ask, rapid cancellation <1 second.
3. SEBI Annual Report 2022-23: Most common India manipulation: synchronized \
trading (wash trades), painting the tape, marking the close.

DISTINGUISHING MANIPULATION FROM LEGITIMATE ACTIVITY:
LEGITIMATE (consider DISMISS): Market makers cancel ratio 40-60% with cancel time \
>800ms and sigma <3; algo traders show high cancel ratio but random timing, no \
price impact; momentum traders show gradual accumulation over hours.
MANIPULATION (consider ESCALATE): Layering — cancel ratio >70%, cancel time <600ms, \
sigma >5; Spoofing — single large order, cancel <500ms, size >40k shares; \
Wash trading — matched accounts, identical sizes, sub-20s window.

Always cite which research criterion supports your verdict. \
Respond ONLY with valid JSON. No text outside the JSON."""

# FIX 1: per-pattern regulatory defaults used when Claude omits the field
_REGULATORY_DEFAULTS = {
    'LAYERING':     'SEBI PFUTP Regulations 2003, Regulation 4(2)(a) — Manipulative, fraudulent and unfair trade practices',
    'SPOOFING':     'SEBI PFUTP Regulations 2003, Regulation 4(2)(e) — Placing orders with no intention of executing them',
    'WASH_TRADING': 'SEBI PFUTP Regulations 2003, Regulation 4(2)(a) — Creating artificial volume through self-dealing',
    'PUMP_AND_DUMP':'SEBI PFUTP Regulations 2003, Regulation 4(2)(b) — Price manipulation through coordinated trading',
}


def build_prompt(alert):
    confidence_hint = alert.get('confidence_hint', 70)
    return f"""Alert ID: {alert['alert_id']}
Timestamp: {alert['detected_at']} UTC
Trader: {alert['trader_id']}
Instrument: {alert['instrument']} (NSE: {alert['instrument']})
Severity: {alert['severity']}
Detected Pattern: {alert['pattern_type']}
Evidence: {alert['evidence_summary']}
Stats: cancel_ratio={alert['cancel_ratio']}, sigma={alert['sigma']}

NSE SURVEILLANCE BENCHMARKS (use these to calibrate your verdict):
Cancel ratio | Normal traders: 5–25%    | Suspicious threshold: >70%  | Critical: >90%
Cancel time  | Normal: 800ms–2000ms     | Suspicious: <600ms          | Critical: <200ms
Sigma        | Normal: <3.0σ            | Suspicious: >8.0σ           | Critical: >15.0σ

A trader with cancel_ratio 60%, sigma 5.0σ, and cancel times >800ms is likely a legitimate market maker — consider DISMISS.
A trader with cancel_ratio >80%, sigma >8.0σ, and cancel times <600ms shows clear manipulation — ESCALATE.

Detector pre-analysis confidence estimate: {confidence_hint}%
Your analysis may refine this up or down based on the evidence quality.

Respond with ONLY this JSON:
{{
  "verdict": "ESCALATE or DISMISS",
  "confidence": {confidence_hint},
  "false_positive_probability": {100 - confidence_hint},
  "risk_level": "CRITICAL, HIGH, MEDIUM, or LOW",
  "rationale": "4-5 sentences: explain the pattern mechanically, cite the specific numbers (cancel_ratio%, sigma vs benchmark, cancel time vs 600ms threshold), and explain why this is or is not manipulation.",
  "simple_explanation": "1-2 sentences in plain English that a non-trader board member can understand.",
  "recommended_action": "Specific action: e.g. Freeze account / File STR with FIU-IND / No action — false positive / Assign to Surveillance Desk L2.",
  "regulatory_reference": "Applicable SEBI regulation with section number."
}}
Replace all values with your actual assessment. confidence must reflect your certainty (52–97).
verdict must be ESCALATE or DISMISS.
risk_level must be CRITICAL, HIGH, MEDIUM, or LOW."""


def triage_alert(alert):
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    start_ms = int(time.time() * 1000)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(alert)}],
    )
    processing_time_ms = int(time.time() * 1000) - start_ms

    # FIX 2: capture real token usage from API response
    input_tokens  = response.usage.input_tokens
    output_tokens = response.usage.output_tokens

    block = response.content[0]
    if not isinstance(block, TextBlock):
        raise ValueError(f"Claude returned unexpected content type: {type(block)}")
    raw = block.text.strip()
    try:
        result = _parse_claude_json(raw)
    except json.JSONDecodeError as e:
        logging.error(f"Claude returned non-JSON for {alert['alert_id']}: {raw[:300]}")
        raise ValueError(f"AI returned invalid JSON: {e}")

    # FIX 1: guarantee regulatory_reference is never NULL
    if not result.get('regulatory_reference'):
        result['regulatory_reference'] = _REGULATORY_DEFAULTS.get(
            alert['pattern_type'],
            'SEBI PFUTP Regulations 2003, Regulation 4(2)(a)'
        )

    triage_id = "TRG-" + str(uuid.uuid4())[:8].upper()
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO triage_results
          (triage_id, alert_id, verdict, confidence, false_positive_probability,
           rationale, simple_explanation, recommended_action, risk_level,
           regulatory_reference, processing_time_ms, input_tokens, output_tokens, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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
            input_tokens,
            output_tokens,
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

    result["triage_id"]          = triage_id
    result["alert_id"]           = alert["alert_id"]
    result["processing_time_ms"] = processing_time_ms
    result["input_tokens"]       = input_tokens
    result["output_tokens"]      = output_tokens
    return result


def build_feedback_prompt(alert, triage, feedback):
    return f"""You are NSE Chief Compliance Officer.

You previously analyzed this alert and gave verdict:
{triage.get('verdict', 'UNKNOWN')} with {triage.get('confidence', 70)}% confidence.

A senior compliance analyst has reviewed your verdict and disagrees.
Their professional assessment:

Analyst Verdict: {feedback['analyst_verdict']}
Analyst Reason: {feedback['analyst_reason']}

Original alert data:
- Pattern: {alert.get('pattern_type', '')}
- Trader: {alert.get('trader_id', '')}
- Cancel Ratio: {alert.get('cancel_ratio', '')}
- Sigma: {alert.get('sigma', '')}
- Evidence: {alert.get('evidence_summary', '')}

The analyst has access to KYC data, trading history, and market context \
that you may not have. Please reconsider your analysis taking into account \
their professional judgment.

Respond with ONLY this JSON:
{{
  "verdict": "ESCALATE or DISMISS",
  "confidence": <integer 52-97>,
  "false_positive_probability": <100 minus confidence>,
  "risk_level": "CRITICAL, HIGH, MEDIUM, or LOW",
  "rationale": "4-5 sentences explaining your reconsidered analysis",
  "simple_explanation": "1-2 plain English sentences",
  "recommended_action": "Specific action",
  "regulatory_reference": "Applicable SEBI regulation",
  "reconsidered": true,
  "reconsideration_reason": "Why you changed or maintained your verdict given analyst feedback",
  "analyst_feedback_incorporated": true
}}"""


def retriage_with_feedback(alert, existing_triage, feedback_data):
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    start_ms = int(time.time() * 1000)
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_feedback_prompt(alert, existing_triage, feedback_data)}],
    )
    processing_time_ms = int(time.time() * 1000) - start_ms

    block = response.content[0]
    if not isinstance(block, TextBlock):
        raise ValueError(f"Unexpected content type: {type(block)}")
    raw = block.text.strip()
    result = _parse_claude_json(raw)

    if not result.get('regulatory_reference'):
        result['regulatory_reference'] = _REGULATORY_DEFAULTS.get(
            alert.get('pattern_type', ''),
            'SEBI PFUTP Regulations 2003, Regulation 4(2)(a)'
        )

    result["processing_time_ms"] = processing_time_ms
    result["input_tokens"]       = response.usage.input_tokens
    result["output_tokens"]      = response.usage.output_tokens
    return result


def deep_investigate(alert, triage, trades, trader_history):
    def _fmt_trades(tlist):
        if not tlist:
            return "No trades available."
        lines = ["Timestamp | Type | Size | Price | Status | Cancel(ms)"]
        for tr in tlist[:30]:
            lines.append(
                f"{str(tr.get('timestamp',''))[:19]} | "
                f"{tr.get('order_type','')} | "
                f"{tr.get('order_size','')} | "
                f"₹{float(tr.get('price') or 0):.2f} | "
                f"{tr.get('order_status','')} | "
                f"{tr.get('cancel_time_ms','')}"
            )
        return "\n".join(lines)

    def _fmt_history(alerts):
        if not alerts:
            return "No prior alert history."
        lines = []
        for a in alerts[:10]:
            lines.append(
                f"- {a.get('alert_id','')} | {a.get('pattern_type','')} | "
                f"{a.get('instrument','')} | {a.get('severity','')} | "
                f"cancel_ratio={a.get('cancel_ratio','')} | sigma={a.get('sigma','')}"
            )
        return "\n".join(lines)

    prompt = f"""You are NSE's most senior Market Surveillance Investigator.
Conduct a deep forensic investigation of this alert.

ALERT: {alert.get('alert_id', '')}
TRADER: {alert.get('trader_id', '')}
PATTERN: {alert.get('pattern_type', '')}
CONFIDENCE: {triage.get('confidence', '') if triage else 'N/A'}%

TRADE-BY-TRADE EVIDENCE:
{_fmt_trades(trades)}

TRADER HISTORY:
{_fmt_history(trader_history)}

Provide a comprehensive JSON investigation report with EXACTLY these 8 keys:
{{
  "manipulation_mechanics": "Step-by-step explanation of HOW the manipulation was executed using actual trade timestamps and sizes",
  "price_impact_analysis": "Did cancelled orders move the price? By how much? For how long?",
  "profit_estimation": "Estimate manipulation profit in INR based on trade sizes and prices",
  "behavioral_fingerprint": "Specific behaviors identifying manipulation vs legitimate trading — timing patterns, order sizes, account relationships",
  "similar_patterns": "Based on trader history — is this isolated or systematic?",
  "evidence_strength": "Rate each evidence piece 1-10 with explanation: cancel_ratio /10, sigma /10, cancel_speed /10, order_size /10, account_links /10",
  "recommended_investigation_steps": "List 5 specific next steps an NSE investigator should take",
  "sebi_prosecution_likelihood": "Probability of successful prosecution as percentage, what additional evidence is needed"
}}

Respond ONLY with valid JSON. No text outside the JSON."""

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system="You are NSE's senior Market Surveillance Investigator. Respond ONLY with valid JSON.",
        messages=[{"role": "user", "content": prompt}],
    )

    block = response.content[0]
    if not isinstance(block, TextBlock):
        raise ValueError(f"Unexpected content type: {type(block)}")
    raw = block.text.strip()
    result = _parse_claude_json(raw)
    result["tokens_used"] = response.usage.input_tokens + response.usage.output_tokens
    return result
