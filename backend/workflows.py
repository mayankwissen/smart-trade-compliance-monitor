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
        "verdict": triage_result.get("verdict"),
        "confidence": triage_result.get("confidence"),
        "risk_level": triage_result.get("risk_level"),
        "rationale": triage_result.get("rationale"),
        "simple_explanation": triage_result.get("simple_explanation"),
        "recommended_action": triage_result.get("recommended_action"),
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
        logging.info("Slack not configured, skipping")
        return False

    verdict_emoji = "🔴" if triage_result.get("verdict") == "ESCALATE" else "🟢"
    simple = triage_result.get("simple_explanation", "")
    action = triage_result.get("recommended_action", "")

    payload = {
        "text": f"🚨 *COMPLIANCE ALERT — {alert['severity']}*",
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"🚨 {alert['pattern_type'].replace('_',' ')} Alert — {alert['severity']}"}},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*Alert ID*\n`{alert['alert_id']}`"},
                {"type": "mrkdwn", "text": f"*Trader*\n`{alert['trader_id']}`"},
                {"type": "mrkdwn", "text": f"*Instrument*\n{alert['instrument']}"},
                {"type": "mrkdwn", "text": f"*Pattern*\n{alert['pattern_type'].replace('_',' ')}"},
            ]},
            {"type": "section", "text": {"type": "mrkdwn",
             "text": f"{verdict_emoji} *Verdict:* {triage_result.get('verdict')} ({triage_result.get('confidence')}% confidence)\n*Rationale:* {triage_result.get('rationale','')}"}},
        ],
    }
    if simple:
        payload["blocks"].append({"type": "section", "text": {"type": "mrkdwn", "text": f"*In simple terms:* {simple}"}})
    if action:
        payload["blocks"].append({"type": "section", "text": {"type": "mrkdwn", "text": f"*Action:* {action}"}})
    payload["blocks"].extend([
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Case:* `{case_id}` → Surveillance Desk L2"}},
        {"type": "divider"},
    ])

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


def send_email_notifications(alert, triage_result, case_id):
    try:
        from emailer import send_alert_email
        conn = get_db()
        rows = conn.execute(
            "SELECT email FROM subscribers WHERE active=1"
        ).fetchall()
        conn.close()
        recipients = [r["email"] for r in rows]
        if not recipients:
            return False
        ok, detail = send_alert_email(alert, triage_result, case_id, recipients)
        if ok:
            conn = get_db()
            conn.execute(
                """INSERT INTO escalations
                  (escalation_id, alert_id, action_type, payload, created_at)
                  VALUES (?,?,?,?,?)""",
                (
                    str(uuid.uuid4()),
                    alert["alert_id"],
                    "EMAIL_SENT",
                    json.dumps({"recipients": len(recipients), "case_id": case_id}),
                    datetime.utcnow().isoformat(),
                ),
            )
            conn.commit()
            conn.close()
        return ok
    except Exception as e:
        logging.error(f"Email notifications failed: {e}")
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

        email_ok = send_email_notifications(alert, triage_result, case_id)
        results.append({"action": "EMAIL_SENT", "success": email_ok})

        flag_watchlist(alert["trader_id"], alert["alert_id"])
        results.append({"action": "WATCHLIST_FLAGGED", "success": True, "monitoring_hours": 72})
    else:
        results.append({
            "action": "NO_ESCALATION",
            "reason": f"Verdict={triage_result.get('verdict')}, Confidence={triage_result.get('confidence')}",
        })
    return results
