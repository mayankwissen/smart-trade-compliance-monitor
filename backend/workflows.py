import os
import json
import uuid
import logging
import requests
from datetime import datetime
from database import get_db

CASES_DIR = os.path.join(os.path.dirname(__file__), "..", "cases")


def create_compliance_case(alert, triage_result):
    os.makedirs(CASES_DIR, exist_ok=True)
    case_id = f"COMP-{uuid.uuid4().hex[:4].upper()}"
    case = {
        "case_id": case_id,
        "alert_id": alert["alert_id"],
        "trader_id": alert["trader_id"],
        "instrument": alert["instrument"],
        "pattern_type": alert["pattern_type"],
        "severity": alert["severity"],
        "verdict": triage_result["verdict"],
        "confidence": triage_result["confidence"],
        "rationale": triage_result["rationale"],
        "assigned_to": "Surveillance Desk L2",
        "created_at": datetime.utcnow().isoformat(),
        "status": "OPEN",
    }
    with open(os.path.join(CASES_DIR, f"{case_id}.json"), "w") as f:
        json.dump(case, f, indent=2)

    conn = get_db()
    conn.execute(
        """INSERT INTO escalations
          (escalation_id, alert_id, action_type, payload, created_at)
          VALUES (?,?,?,?,?)""",
        (
            str(uuid.uuid4()),
            alert["alert_id"],
            "CASE_CREATED",
            json.dumps({"case_id": case_id, "assigned_to": "Surveillance Desk L2"}),
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return case_id


def send_slack_notification(alert, triage_result, case_id):
    webhook = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook:
        logging.info("Slack not configured, skipping notification")
        return False

    payload = {
        "text": f"🚨 *COMPLIANCE ALERT — {alert['severity']}*",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🚨 {alert['pattern_type']} Alert — {alert['severity']}",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Alert ID*\n{alert['alert_id']}"},
                    {"type": "mrkdwn", "text": f"*Trader*\n{alert['trader_id']}"},
                    {"type": "mrkdwn", "text": f"*Instrument*\n{alert['instrument']}"},
                    {"type": "mrkdwn", "text": f"*Pattern*\n{alert['pattern_type']}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*Verdict:* {triage_result['verdict']} "
                        f"({triage_result['confidence']}% confidence)\n"
                        f"*Rationale:* {triage_result['rationale']}"
                    ),
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Case Created:* {case_id} → Assigned to Surveillance Desk L2",
                },
            },
            {"type": "divider"},
        ],
    }

    try:
        resp = requests.post(webhook, json=payload, timeout=5)
        conn = get_db()
        conn.execute(
            """INSERT INTO escalations
              (escalation_id, alert_id, action_type, payload, created_at)
              VALUES (?,?,?,?,?)""",
            (
                str(uuid.uuid4()),
                alert["alert_id"],
                "SLACK_NOTIFIED",
                json.dumps({"channel": "#compliance-alerts", "case_id": case_id}),
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        conn.close()
        return resp.status_code == 200
    except Exception as e:
        logging.error(f"Slack notification failed: {e}")
        return False


def flag_watchlist(trader_id, alert_id):
    conn = get_db()
    conn.execute(
        """INSERT INTO escalations
          (escalation_id, alert_id, action_type, payload, created_at)
          VALUES (?,?,?,?,?)""",
        (
            str(uuid.uuid4()),
            alert_id,
            "WATCHLIST_FLAGGED",
            json.dumps({
                "trader_id": trader_id,
                "monitoring_hours": 72,
                "reason": "Suspicious pattern detected, enhanced monitoring active",
            }),
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return True


def run_escalation_workflow(alert, triage_result):
    results = []

    if triage_result.get("verdict") == "ESCALATE" and triage_result.get("confidence", 0) >= 60:
        case_id = create_compliance_case(alert, triage_result)
        results.append({"action": "CASE_CREATED", "case_id": case_id, "success": True})

        slack_ok = send_slack_notification(alert, triage_result, case_id)
        results.append({"action": "SLACK_NOTIFIED", "success": slack_ok})

        watchlist_ok = flag_watchlist(alert["trader_id"], alert["alert_id"])
        results.append({
            "action": "WATCHLIST_FLAGGED",
            "success": watchlist_ok,
            "monitoring_hours": 72,
        })
    else:
        results.append({
            "action": "NO_ESCALATION",
            "reason": (
                f"Verdict={triage_result.get('verdict')}, "
                f"Confidence={triage_result.get('confidence')}"
            ),
        })

    return results
