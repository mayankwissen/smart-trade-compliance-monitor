import smtplib
import os
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime


def _build_html(alert, triage_result, case_id):
    verdict = triage_result.get("verdict", "UNKNOWN")
    confidence = triage_result.get("confidence", 0)
    rationale = triage_result.get("rationale", "")
    simple = triage_result.get("simple_explanation", "")
    action = triage_result.get("recommended_action", "")
    risk = triage_result.get("risk_level", alert.get("severity", ""))
    verdict_color = "#ef4444" if verdict == "ESCALATE" else "#22c55e"

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#000000;border-bottom:2px solid #f0b429;padding:24px 32px;">
    <div style="font-size:11px;color:#525252;letter-spacing:0.12em;margin-bottom:6px;">WISSEN TECHNOLOGY HACKATHON 2026</div>
    <div style="font-size:22px;font-weight:700;color:#f0b429;letter-spacing:0.04em;">TRADE SURVEILLANCE ENGINE</div>
    <div style="font-size:12px;color:#525252;margin-top:4px;">Automated Compliance Alert Notification</div>
  </td></tr>

  <!-- Alert banner -->
  <tr><td style="background:{verdict_color}22;border-bottom:1px solid {verdict_color}44;padding:16px 32px;">
    <span style="font-size:11px;color:{verdict_color};font-weight:700;letter-spacing:0.1em;">
      {alert.get('severity','')} SEVERITY &nbsp;&bull;&nbsp; {alert.get('pattern_type','').replace('_',' ')} &nbsp;&bull;&nbsp; {alert.get('instrument','')}
    </span>
  </td></tr>

  <!-- Alert details -->
  <tr><td style="padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:4px;">ALERT ID</div>
          <div style="font-size:14px;color:#3b82f6;font-family:'Courier New',monospace;">{alert.get('alert_id','')}</div>
        </td>
        <td style="width:50%;padding-bottom:16px;vertical-align:top;">
          <div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:4px;">TRADER ID</div>
          <div style="font-size:14px;color:#f1f5f9;font-family:'Courier New',monospace;">{alert.get('trader_id','')}</div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:16px;vertical-align:top;">
          <div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:4px;">INSTRUMENT</div>
          <div style="font-size:14px;color:#f1f5f9;font-weight:700;">{alert.get('instrument','')}</div>
        </td>
        <td style="padding-bottom:16px;vertical-align:top;">
          <div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:4px;">DETECTED AT</div>
          <div style="font-size:14px;color:#a0a0a0;font-family:'Courier New',monospace;">{alert.get('detected_at','')[:19]}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Verdict -->
  <tr><td style="padding:0 32px 24px;">
    <div style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:24px;text-align:center;">
      <div style="font-size:11px;color:#525252;letter-spacing:0.1em;margin-bottom:12px;">AI VERDICT &bull; CLAUDE SONNET</div>
      <div style="font-size:52px;font-weight:700;color:{verdict_color};letter-spacing:0.05em;">{verdict}</div>
      <div style="margin-top:12px;">
        <div style="background:#1a1a1a;border-radius:4px;height:8px;overflow:hidden;">
          <div style="height:100%;background:{verdict_color};border-radius:4px;width:{confidence}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:#525252;">
          <span>CONFIDENCE: {confidence}%</span>
          <span>FALSE POSITIVE: {triage_result.get("false_positive_probability", 100 - confidence)}%</span>
        </div>
      </div>
    </div>
  </td></tr>

  <!-- Evidence -->
  <tr><td style="padding:0 32px 20px;">
    <div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:8px;">EVIDENCE</div>
    <div style="background:#0a0a0a;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 6px 6px 0;font-size:13px;color:#a0a0a0;line-height:1.6;font-family:'Courier New',monospace;">
      {alert.get('evidence_summary','')}
    </div>
  </td></tr>

  <!-- Rationale -->
  <tr><td style="padding:0 32px 20px;">
    <div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:8px;">AI RATIONALE</div>
    <div style="background:#0a0a0a;border-left:3px solid {verdict_color};padding:12px 16px;border-radius:0 6px 6px 0;font-size:13px;color:#a0a0a0;line-height:1.7;font-style:italic;">
      {rationale}
    </div>
  </td></tr>

  <!-- Simple explanation -->
  {'<tr><td style="padding:0 32px 20px;"><div style="background:#f0b42911;border:1px solid #f0b42933;border-radius:8px;padding:16px;"><div style="font-size:10px;color:#f0b429;letter-spacing:0.1em;margin-bottom:8px;">IN SIMPLE TERMS</div><div style="font-size:13px;color:#f1f5f9;line-height:1.6;">' + simple + '</div></div></td></tr>' if simple else ''}

  <!-- Recommended action -->
  {'<tr><td style="padding:0 32px 20px;"><div style="font-size:10px;color:#525252;letter-spacing:0.1em;margin-bottom:8px;">RECOMMENDED ACTION</div><div style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:12px 16px;font-size:13px;color:#f1f5f9;">' + action + '</div></td></tr>' if action else ''}

  <!-- Case info -->
  <tr><td style="padding:0 32px 24px;">
    <div style="background:#f0b42911;border:1px solid #f0b42933;border-radius:8px;padding:16px;">
      <div style="font-size:10px;color:#f0b429;letter-spacing:0.1em;margin-bottom:8px;">COMPLIANCE CASE</div>
      <div style="font-size:14px;color:#f0b429;font-weight:700;">{case_id}</div>
      <div style="font-size:12px;color:#525252;margin-top:4px;">Assigned to: Surveillance Desk L2 &nbsp;&bull;&nbsp; Status: OPEN</div>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#000000;border-top:1px solid #2a2a2a;padding:20px 32px;text-align:center;">
    <div style="font-size:11px;color:#525252;">Wissen Technology Hackathon 2026 &bull; Trade Surveillance Engine &bull; Powered by Claude AI</div>
    <div style="font-size:10px;color:#333333;margin-top:4px;">This is an automated compliance notification. Do not reply to this email.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""


def send_alert_email(alert, triage_result, case_id, recipients):
    sender = os.getenv("EMAIL_SENDER")
    password = os.getenv("EMAIL_PASSWORD")
    if not sender or not password:
        logging.info("Email not configured (EMAIL_SENDER/EMAIL_PASSWORD missing), skipping")
        return False, "not_configured"
    if not recipients:
        return False, "no_recipients"

    pattern = alert.get("pattern_type", "").replace("_", " ")
    severity = alert.get("severity", "")
    instrument = alert.get("instrument", "")
    subject = f"COMPLIANCE ALERT - {severity} | {pattern} | {instrument}"

    html_body = _build_html(alert, triage_result, case_id)

    sent_count = 0
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender, password)

        for recipient in recipients:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"Trade Surveillance Engine <{sender}>"
            msg["To"] = recipient
            msg.attach(MIMEText(html_body, "html"))
            server.sendmail(sender, recipient, msg.as_string())
            sent_count += 1

        server.quit()
        logging.info(f"Sent alert email to {sent_count} recipients")
        return True, sent_count
    except Exception as e:
        logging.error(f"Email send failed: {e}")
        return False, str(e)
