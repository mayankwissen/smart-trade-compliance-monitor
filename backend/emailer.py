import os
import json
import urllib.request
import urllib.error
import logging


def _build_html(alert, triage_result):
    confidence = triage_result.get("confidence", 0)
    fp = triage_result.get("false_positive_probability", 100 - confidence)
    verdict = triage_result.get("verdict", "PENDING")
    verdict_color = "#ff4757" if verdict == "ESCALATE" else "#2ed573"
    severity = alert.get("severity", "")
    sev_bg = "3d0000" if severity == "HIGH" else "3d2000"
    sev_border = "7f1d1d" if severity == "HIGH" else "78350f"
    sev_color = "#ff4757" if severity == "HIGH" else "#ffb347"

    return f"""<!DOCTYPE html>
<html>
<body style="font-family:monospace;background:#03050d;color:#f0f2f8;padding:20px;margin:0">
  <div style="max-width:600px;margin:0 auto">

    <div style="background:#000;padding:16px 20px;border-bottom:2px solid #f0b429;border-radius:8px 8px 0 0">
      <h2 style="margin:0;color:#f0b429;font-size:18px;letter-spacing:2px">
        🛡 TRADE SURVEILLANCE ENGINE
      </h2>
      <p style="margin:4px 0 0;color:#6b7a99;font-size:11px;letter-spacing:1px">
        Wissen Technology Hackathon 2026 · Powered by Claude AI
      </p>
    </div>

    <div style="background:#0a0f1c;padding:24px;border:1px solid rgba(240,180,41,0.12);border-top:none">

      <div style="background:#{sev_bg};border:1px solid #{sev_border};border-radius:8px;padding:16px;margin-bottom:20px">
        <h3 style="margin:0 0 12px;color:{sev_color};font-size:16px">
          ⚠ {severity} SEVERITY — {alert.get('pattern_type', '')}
        </h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <tr>
            <td style="color:#6b7a99;padding:4px 0;width:40%">Alert ID</td>
            <td style="color:#f0f2f8">{alert.get('alert_id', '')}</td>
          </tr>
          <tr>
            <td style="color:#6b7a99;padding:4px 0">Trader</td>
            <td style="color:#f0b429;font-weight:bold">{alert.get('trader_id', '')}</td>
          </tr>
          <tr>
            <td style="color:#6b7a99;padding:4px 0">Instrument</td>
            <td style="color:#f0f2f8">{alert.get('instrument', '')} (NSE)</td>
          </tr>
          <tr>
            <td style="color:#6b7a99;padding:4px 0">Pattern</td>
            <td style="color:#f0f2f8">{alert.get('pattern_type', '')}</td>
          </tr>
        </table>
      </div>

      <div style="text-align:center;background:#080c18;border-radius:8px;padding:20px;margin-bottom:20px">
        <div style="font-size:10px;color:#6b7a99;letter-spacing:2px;margin-bottom:8px">
          AI VERDICT · CLAUDE SONNET 4.6
        </div>
        <div style="font-size:52px;font-weight:900;color:{verdict_color};letter-spacing:2px;text-shadow:0 0 30px {verdict_color}66">
          {verdict}
        </div>
        <div style="background:#1a2030;border-radius:3px;height:6px;margin:12px 0;overflow:hidden">
          <div style="height:100%;background:{verdict_color};width:{confidence}%;border-radius:3px"></div>
        </div>
        <div style="font-size:12px;color:#6b7a99">
          Confidence: <strong style="color:#f0f2f8">{confidence}%</strong> &nbsp;|&nbsp;
          False Positive Risk: <strong style="color:#f0f2f8">{fp}%</strong>
        </div>
      </div>

      <div style="background:#080c18;border-left:3px solid {verdict_color};padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:16px">
        <div style="font-size:10px;color:#6b7a99;letter-spacing:2px;margin-bottom:8px">AI RATIONALE</div>
        <div style="font-size:13px;color:#f0f2f8;line-height:1.7">
          {triage_result.get('rationale', 'N/A')}
        </div>
      </div>

      <div style="background:#080c18;border-left:3px solid #4f6ef7;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:16px">
        <div style="font-size:10px;color:#6b7a99;letter-spacing:2px;margin-bottom:8px">IN PLAIN TERMS</div>
        <div style="font-size:13px;color:#f0f2f8;line-height:1.7">
          {triage_result.get('simple_explanation', 'N/A')}
        </div>
      </div>

      <div style="background:#1e1b4b22;border:1px solid #4338ca44;border-radius:6px;padding:12px 16px;margin-bottom:16px">
        <div style="font-size:11px;color:#a5b4fc">
          📋 {triage_result.get('regulatory_reference', 'SEBI PFUTP Regulations 2003')}
        </div>
      </div>

      <div style="background:#080c18;border-radius:6px;padding:14px 16px">
        <div style="font-size:10px;color:#6b7a99;letter-spacing:2px;margin-bottom:10px">AUTOMATED ACTIONS TRIGGERED</div>
        <div style="font-size:12px;color:#2ed573;line-height:2">
          ✓ Compliance case created — Assigned to Surveillance Desk L2<br>
          ✓ Slack notification sent — #compliance-alerts<br>
          ✓ Trader {alert.get('trader_id', '')} flagged — 72hr enhanced monitoring
        </div>
      </div>

    </div>

    <div style="background:#080c18;padding:12px 20px;border-radius:0 0 8px 8px;border:1px solid rgba(240,180,41,0.12);border-top:none;text-align:center">
      <span style="color:#3d4a6b;font-size:10px;letter-spacing:1px">
        Trade Surveillance Engine · Wissen Technology Hackathon 2026 · This is an automated alert
      </span>
    </div>

  </div>
</body>
</html>"""


def send_alert_email(recipient_emails, alert, triage_result):
    api_key = os.getenv("SENDGRID_API_KEY")
    sender = os.getenv("EMAIL_SENDER") or "noreply@tradesurveillance.com"

    if not api_key:
        logging.info("SendGrid not configured (SENDGRID_API_KEY missing), skipping")
        return False

    if not recipient_emails:
        return False

    severity = alert.get("severity", "")
    pattern = alert.get("pattern_type", "")
    instrument = alert.get("instrument", "")
    subject = f"🚨 COMPLIANCE ALERT — {severity} | {pattern} | {instrument}"
    html_body = _build_html(alert, triage_result)

    try:
        for recipient in recipient_emails:
            payload = json.dumps({
                "personalizations": [{"to": [{"email": recipient}]}],
                "from": {"email": sender, "name": "Trade Surveillance Engine"},
                "subject": subject,
                "content": [{"type": "text/html", "value": html_body}],
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://api.sendgrid.com/v3/mail/send",
                data=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 202:
                    logging.info(f"Email sent to {recipient} via SendGrid")
                else:
                    logging.warning(f"SendGrid unexpected status: {resp.status}")

        return True

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        logging.error(f"SendGrid HTTP error {e.code}: {body}")
        return False
    except Exception as e:
        logging.error(f"SendGrid error: {e}")
        return False
