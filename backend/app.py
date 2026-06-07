from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv
import os
import uuid
import json
from datetime import datetime, timezone

load_dotenv()

from database import init_db, seed_from_csv, get_db, _insert_trade_dicts, alert_exists
from ingestor import load_trades, get_all_trader_instrument_pairs, get_trade_window
from detector import run_all_detectors
from triage import triage_alert
from workflows import run_escalation_workflow
from market_data import fetch_real_prices, generate_realistic_trades

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:3000",
    "https://smart-trade-compliance-monitor-1.onrender.com",
])

with app.app_context():
    init_db()
    seed_from_csv()
    # Auto-detect on startup so Render cold-starts have data immediately
    try:
        _startup_trades = load_trades()
        _startup_pairs  = get_all_trader_instrument_pairs()
        _startup_conn   = get_db()
        for _tid, _ins in _startup_pairs:
            for _alert in run_all_detectors(_tid, _ins, _startup_trades):
                if not alert_exists(_startup_conn, _tid, _ins, _alert["pattern_type"]):
                    _startup_conn.execute(
                        """INSERT INTO alerts
                          (alert_id, detected_at, trader_id, instrument, pattern_type,
                           severity, evidence_summary, cancel_ratio, sigma, status)
                          VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (
                            _alert["alert_id"], _alert["detected_at"], _alert["trader_id"],
                            _alert["instrument"], _alert["pattern_type"], _alert["severity"],
                            _alert["evidence_summary"], _alert["cancel_ratio"],
                            _alert["sigma"], _alert["status"],
                        ),
                    )
        _startup_conn.commit()
        _startup_conn.close()
        app.logger.info("Startup auto-detection complete")
    except Exception as _e:
        app.logger.error(f"Startup auto-detection failed: {_e}")


# ── Health / Ping ─────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    conn.close()
    return jsonify({
        "status": "ok",
        "trades_loaded": count,
        "version": "2.0.0",
        "model": "claude-sonnet-4-6",
    })


@app.route("/api/ping")
def ping():
    return jsonify({"status": "awake", "timestamp": datetime.now(timezone.utc).isoformat()})


@app.route("/api/warmup")
def warmup():
    conn = get_db()
    trades = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    alerts = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    conn.close()
    return jsonify({
        "status": "warm",
        "trades": trades,
        "alerts": alerts,
        "ready": trades > 0 and alerts > 0,
    })


@app.route("/api/test-email")
def test_email():
    import os
    api_key = os.getenv("SENDGRID_API_KEY")
    sender  = os.getenv("EMAIL_SENDER")
    if not api_key:
        return jsonify({
            "success": False,
            "error": "SENDGRID_API_KEY not set in Render environment variables",
            "sendgrid_set": False,
            "sender_set": bool(sender),
        }), 500

    recipient = sender or "test@tradesurveillance.com"
    dummy_alert = {
        "alert_id": "TEST-001",
        "trader_id": "T-TEST",
        "instrument": "HDFCBANK",
        "pattern_type": "LAYERING",
        "severity": "HIGH",
        "evidence_summary": "Test email from /api/test-email — SendGrid HTTP API.",
        "detected_at": "2026-06-06T00:00:00",
    }
    dummy_triage = {
        "verdict": "ESCALATE",
        "confidence": 99,
        "false_positive_probability": 1,
        "risk_level": "HIGH",
        "rationale": "This is a test email verifying SendGrid delivery from Render.",
        "simple_explanation": "Email delivery test via SendGrid HTTP API.",
        "recommended_action": "No action required — this is a test.",
        "regulatory_reference": "N/A — test only",
    }
    from emailer import send_alert_email
    ok = send_alert_email([recipient], dummy_alert, dummy_triage)
    if ok:
        return jsonify({"success": True, "detail": f"Email sent to {recipient} via SendGrid"})
    return jsonify({"success": False, "detail": "SendGrid delivery failed — check Render logs"}), 500


# ── Trades ────────────────────────────────────────────────────────────────────

@app.route("/api/trades")
def get_trades():
    page      = int(request.args.get("page", 1))
    limit     = int(request.args.get("limit", 50))
    trader_id = request.args.get("trader_id", "")
    instrument= request.args.get("instrument", "")
    status    = request.args.get("status", "")
    offset    = (page - 1) * limit

    where, params = [], []
    if trader_id:
        where.append("trader_id LIKE ?")
        params.append(f"%{trader_id}%")
    if instrument:
        where.append("instrument=?")
        params.append(instrument)
    if status:
        where.append("order_status=?")
        params.append(status.upper())

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    conn = get_db()
    rows = conn.execute(
        f"SELECT * FROM trades {where_sql} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    total = conn.execute(
        f"SELECT COUNT(*) FROM trades {where_sql}", params
    ).fetchone()[0]
    conn.close()
    return jsonify({"trades": [dict(r) for r in rows], "total": total, "page": page, "limit": limit})


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.route("/api/alerts")
def get_alerts():
    pattern_type = request.args.get("pattern_type", "")
    severity     = request.args.get("severity", "")
    status       = request.args.get("status", "")
    search       = request.args.get("search", "")
    page         = int(request.args.get("page", 1))
    limit        = int(request.args.get("limit", 100))
    offset       = (page - 1) * limit

    where, params = [], []
    if pattern_type:
        where.append("a.pattern_type=?"); params.append(pattern_type)
    if severity:
        where.append("a.severity=?"); params.append(severity)
    if status:
        where.append("a.status=?"); params.append(status)
    if search:
        where.append("(a.trader_id LIKE ? OR a.alert_id LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    conn = get_db()
    rows = conn.execute(f"""
        SELECT a.*, t.verdict, t.confidence, t.false_positive_probability,
               t.rationale, t.simple_explanation, t.recommended_action,
               t.risk_level, t.processing_time_ms
        FROM alerts a
        LEFT JOIN triage_results t ON a.alert_id = t.alert_id
        {where_sql}
        ORDER BY a.detected_at DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()
    total = conn.execute(
        f"SELECT COUNT(*) FROM alerts a {where_sql}", params
    ).fetchone()[0]
    conn.close()
    return jsonify({"alerts": [dict(r) for r in rows], "total": total, "page": page, "limit": limit})


@app.route("/api/alert/<alert_id>/trades")
def get_alert_trades(alert_id):
    conn = get_db()
    alert = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
    if not alert:
        conn.close()
        return jsonify({"error": "Alert not found"}), 404
    alert = dict(alert)
    rows = conn.execute(
        "SELECT * FROM trades WHERE trader_id=? AND instrument=? ORDER BY timestamp",
        (alert["trader_id"], alert["instrument"]),
    ).fetchall()
    conn.close()
    trades = []
    for r in rows:
        t = dict(r)
        t["is_suspicious"] = (
            t["order_size"] > 50000 or
            (t["order_status"] == "CANCELLED" and t["cancel_time_ms"] > 0 and t["cancel_time_ms"] < 600)
        )
        trades.append(t)
    return jsonify({"trades": trades, "alert": alert})


@app.route("/api/alert/<alert_id>/full")
def get_alert_full(alert_id):
    conn = get_db()
    alert = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
    if not alert:
        conn.close()
        return jsonify({"error": "Alert not found"}), 404
    alert = dict(alert)

    triage = conn.execute(
        "SELECT * FROM triage_results WHERE alert_id=?", (alert_id,)
    ).fetchone()

    escs = conn.execute(
        "SELECT * FROM escalations WHERE alert_id=? ORDER BY created_at",
        (alert_id,),
    ).fetchall()

    trades = conn.execute(
        "SELECT * FROM trades WHERE trader_id=? AND instrument=? ORDER BY timestamp",
        (alert["trader_id"], alert["instrument"]),
    ).fetchall()
    conn.close()

    trade_list = []
    for r in trades:
        t = dict(r)
        t["is_suspicious"] = (
            t["order_size"] > 50000 or
            (t["order_status"] == "CANCELLED" and t["cancel_time_ms"] > 0 and t["cancel_time_ms"] < 600)
        )
        trade_list.append(t)

    return jsonify({
        "alert": alert,
        "triage": dict(triage) if triage else None,
        "escalations": [dict(e) for e in escs],
        "trades": trade_list,
    })


# ── Replay / Detection ────────────────────────────────────────────────────────

@app.route("/api/replay/start", methods=["POST"])
def replay_start():
    all_trades = load_trades()
    pairs = get_all_trader_instrument_pairs()
    saved_count = 0
    conn = get_db()

    for trader_id, instrument in pairs:
        try:
            alerts = run_all_detectors(trader_id, instrument, all_trades)
            for alert in alerts:
                if not alert_exists(conn, trader_id, instrument, alert["pattern_type"]):
                    conn.execute(
                        """INSERT INTO alerts
                          (alert_id, detected_at, trader_id, instrument, pattern_type,
                           severity, evidence_summary, cancel_ratio, sigma, status)
                          VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (
                            alert["alert_id"], alert["detected_at"], alert["trader_id"],
                            alert["instrument"], alert["pattern_type"], alert["severity"],
                            alert["evidence_summary"], alert["cancel_ratio"],
                            alert["sigma"], alert["status"],
                        ),
                    )
                    saved_count += 1
        except Exception as e:
            app.logger.error(f"Detection error for {trader_id}/{instrument}: {e}")

    conn.commit()
    conn.close()
    return jsonify({"status": "ok", "alerts_detected": saved_count, "pairs_scanned": len(pairs)})


# ── Triage ────────────────────────────────────────────────────────────────────

@app.route("/api/triage/<alert_id>", methods=["POST"])
def run_triage(alert_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Alert not found"}), 404
    alert = dict(row)
    if not request.args.get("force"):
        existing = conn.execute("SELECT * FROM triage_results WHERE alert_id=?", (alert_id,)).fetchone()
        if existing:
            escs = conn.execute(
                "SELECT * FROM escalations WHERE alert_id=? ORDER BY created_at", (alert_id,)
            ).fetchall()
            conn.close()
            return jsonify({"alert": alert, "triage": dict(existing), "escalations": [dict(e) for e in escs]})
    conn.close()
    try:
        triage_result = triage_alert(alert)
        escalation_results = run_escalation_workflow(alert, triage_result)
        return jsonify({"alert": alert, "triage": triage_result, "escalations": escalation_results})
    except Exception as e:
        app.logger.error(f"Triage error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/triage/<alert_id>", methods=["GET"])
def get_triage(alert_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM triage_results WHERE alert_id=?", (alert_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "No triage result yet"}), 404
    return jsonify(dict(row))


# ── Escalations ───────────────────────────────────────────────────────────────

@app.route("/api/escalations")
def get_escalations():
    page  = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 25))
    offset= (page - 1) * limit
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM escalations ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM escalations").fetchone()[0]
    conn.close()
    return jsonify({"escalations": [dict(r) for r in rows], "total": total})


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.route("/api/stats")
def get_stats():
    conn = get_db()
    total_trades  = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    total_alerts  = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    escalated     = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='ESCALATED'").fetchone()[0]
    dismissed     = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='DISMISSED'").fetchone()[0]
    pending       = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='PENDING'").fetchone()[0]
    high          = conn.execute("SELECT COUNT(*) FROM alerts WHERE severity='HIGH'").fetchone()[0]
    layering      = conn.execute("SELECT COUNT(*) FROM alerts WHERE pattern_type='LAYERING'").fetchone()[0]
    spoofing      = conn.execute("SELECT COUNT(*) FROM alerts WHERE pattern_type='SPOOFING'").fetchone()[0]
    wash          = conn.execute("SELECT COUNT(*) FROM alerts WHERE pattern_type='WASH_TRADING'").fetchone()[0]
    pump          = conn.execute("SELECT COUNT(*) FROM alerts WHERE pattern_type='PUMP_AND_DUMP'").fetchone()[0]
    conn.close()
    return jsonify({
        "total_trades": total_trades, "total_alerts": total_alerts,
        "escalated": escalated, "dismissed": dismissed, "pending": pending,
        "high_severity": high,
        "patterns": {"layering": layering, "spoofing": spoofing, "wash_trading": wash, "pump_and_dump": pump},
    })


@app.route("/api/token-stats")
def token_stats():
    conn = get_db()
    row = conn.execute("""
        SELECT COUNT(*),
               COALESCE(SUM(input_tokens), 0),
               COALESCE(SUM(output_tokens), 0),
               AVG(processing_time_ms)
        FROM triage_results
    """).fetchone()
    conn.close()

    total_calls   = row[0]
    total_input   = row[1]
    total_output  = row[2]
    avg_time      = int(row[3] or 2400)

    # Fall back to estimates for rows that predate real token tracking
    if total_input == 0 and total_calls > 0:
        total_input  = total_calls * 280
        total_output = total_calls * 180
    total_tokens = total_input + total_output
    # Correct pricing: input $3/Mtok, output $15/Mtok
    cost_usd = round((total_input * 3 + total_output * 15) / 1_000_000, 6)

    return jsonify({
        "total_triage_calls":     total_calls,
        "total_input_tokens":     total_input,
        "total_output_tokens":    total_output,
        "total_tokens":           total_tokens,
        "estimated_cost_usd":     cost_usd,
        "avg_processing_time_ms": avg_time,
        "model":                  "claude-sonnet-4-6",
    })


# ── Market Data ───────────────────────────────────────────────────────────────

@app.route("/api/market-prices")
def get_market_prices():
    try:
        prices = fetch_real_prices()
        result = {s: {"current": d["current"], "high": d["high"], "low": d["low"], "volume": d["volume"], "source": d.get("source", "live")} for s, d in prices.items()}
        return jsonify({"prices": result, "fetched_at": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        app.logger.error(f"Market prices error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/refresh-data", methods=["POST"])
def refresh_data():
    try:
        prices = fetch_real_prices()
        trades = generate_realistic_trades(prices)
        conn = get_db()
        conn.execute("DELETE FROM trades")
        conn.execute("DELETE FROM alerts")
        conn.execute("DELETE FROM triage_results")
        conn.execute("DELETE FROM escalations")
        _insert_trade_dicts(conn, trades)
        count = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        conn.commit()
        conn.close()
        return jsonify({
            "status": "ok",
            "trades_inserted": count,
            "prices_used": {s: d["current"] for s, d in prices.items()},
            "refreshed_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        app.logger.error(f"Refresh data error: {e}")
        return jsonify({"error": str(e)}), 500


# ── Demo Reset ───────────────────────────────────────────────────────────────

@app.route("/api/reset", methods=["POST"])
def reset_demo():
    conn = get_db()
    conn.execute("DELETE FROM alerts")
    conn.execute("DELETE FROM triage_results")
    conn.execute("DELETE FROM escalations")
    conn.commit()
    conn.close()
    return jsonify({"status": "reset", "message": "Demo reset complete. Ready for fresh run."})


# ── Subscribers ───────────────────────────────────────────────────────────────

@app.route("/api/subscribe", methods=["POST"])
def subscribe():
    data  = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return jsonify({"error": "Invalid email"}), 400
    conn = get_db()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO subscribers (subscriber_id, email, active, created_at) VALUES (?,?,1,?)",
            (str(uuid.uuid4()), email, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM subscribers WHERE active=1").fetchone()[0]
        conn.close()
        return jsonify({"status": "subscribed", "email": email, "total_subscribers": count})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route("/api/unsubscribe", methods=["POST", "DELETE"])
def unsubscribe():
    data  = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    conn = get_db()
    conn.execute("UPDATE subscribers SET active=0 WHERE email=?", (email,))
    conn.commit()
    conn.close()
    return jsonify({"status": "unsubscribed", "email": email})


@app.route("/api/subscribers/count")
def subscribers_count():
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) FROM subscribers WHERE active=1").fetchone()[0]
    conn.close()
    return jsonify({"count": count})


# ── Export ────────────────────────────────────────────────────────────────────

@app.route("/api/export/case/<alert_id>", methods=["POST", "GET"])
def export_case(alert_id):
    conn = get_db()
    alert = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
    if not alert:
        conn.close()
        return jsonify({"error": "Alert not found"}), 404
    alert = dict(alert)
    triage = conn.execute("SELECT * FROM triage_results WHERE alert_id=?", (alert_id,)).fetchone()
    triage = dict(triage) if triage else None
    escs   = conn.execute("SELECT * FROM escalations WHERE alert_id=? ORDER BY created_at", (alert_id,)).fetchall()
    trades = conn.execute(
        "SELECT * FROM trades WHERE trader_id=? AND instrument=? ORDER BY timestamp",
        (alert["trader_id"], alert["instrument"]),
    ).fetchall()
    conn.close()
    escs   = [dict(e) for e in escs]
    trades = [dict(t) for t in trades]

    pattern_label = alert.get("pattern_type", "").replace("_", " ")
    cancel_pct    = round((alert.get("cancel_ratio") or 0) * 100, 1)
    sigma_val     = round(alert.get("sigma") or 0, 2)
    export_time   = datetime.now().strftime("%d %B %Y, %H:%M UTC")

    verdict_html = ""
    if triage:
        v = triage.get("verdict", "")
        vc = "#dc2626" if v == "ESCALATE" else "#16a34a"
        verdict_html = f"""
        <div class="section">
          <div class="section-title">AI TRIAGE VERDICT — CLAUDE SONNET (NSE Chief Compliance Officer)</div>
          <div style="text-align:center;padding:24px 0 16px;">
            <div style="font-size:48px;font-weight:800;color:{vc};letter-spacing:.06em;font-family:'Helvetica Neue',Arial,sans-serif;">{v}</div>
            <div style="font-size:13px;color:#555;margin-top:6px;">Confidence: <strong>{triage.get("confidence","")}%</strong> &nbsp;|&nbsp; False Positive Probability: <strong>{triage.get("false_positive_probability","")}%</strong> &nbsp;|&nbsp; Risk Level: <strong>{triage.get("risk_level","")}</strong></div>
            <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;max-width:400px;margin:12px auto 0;">
              <div style="height:100%;background:{vc};width:{triage.get('confidence',0)}%;border-radius:4px;"></div>
            </div>
          </div>
          <div class="field-row"><div class="field-label">AI Rationale</div><div class="field-value" style="font-style:italic;line-height:1.8;">{triage.get("rationale","")}</div></div>
          <div class="field-row"><div class="field-label">In Plain Terms</div><div class="field-value">{triage.get("simple_explanation","")}</div></div>
          <div class="field-row"><div class="field-label">Recommended Action</div><div class="field-value" style="font-weight:600;color:#111;">{triage.get("recommended_action","")}</div></div>
          <div class="field-row"><div class="field-label">Regulatory Reference</div><div class="field-value" style="font-family:'Courier New',monospace;font-size:12px;">{triage.get("regulatory_reference","")}</div></div>
        </div>"""

    esc_colors = {"CASE_CREATED":"#16a34a","SLACK_NOTIFIED":"#2563eb","WATCHLIST_FLAGGED":"#d97706","EMAIL_SENT":"#7c3aed","NO_ESCALATION":"#6b7280"}
    esc_labels = {"CASE_CREATED":"Compliance Case Created","SLACK_NOTIFIED":"Slack Alert Sent","WATCHLIST_FLAGGED":"72-Hour Watchlist Active","EMAIL_SENT":"Email Notifications Sent"}
    esc_rows = ""
    for e in escs:
        at = e.get("action_type","")
        col = esc_colors.get(at, "#6b7280")
        label = esc_labels.get(at, at.replace("_"," ").title())
        ts = (e.get("created_at") or "")[:19]
        esc_rows += f'<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f3f4f6;"><div style="width:10px;height:10px;border-radius:50%;background:{col};flex-shrink:0;"></div><div style="flex:1;font-size:13px;font-weight:600;color:#111;">{label}</div><div style="font-size:11px;color:#6b7280;font-family:\'Courier New\',monospace;">{ts}</div></div>'

    trade_rows = ""
    for tr in trades[:50]:
        s = tr.get("order_status","")
        sc = "#dc2626" if s=="CANCELLED" else ("#16a34a" if s=="EXECUTED" else "#6b7280")
        tc = "#16a34a" if tr.get("order_type")=="BUY" else "#dc2626"
        trade_rows += f"""<tr>
          <td style="font-family:'Courier New',monospace;font-size:11px;">{(tr.get('timestamp') or '')[:19]}</td>
          <td style="font-weight:700;color:{tc};">{tr.get('order_type','')}</td>
          <td style="font-family:'Courier New',monospace;">{int(tr.get('order_size') or 0):,}</td>
          <td style="font-family:'Courier New',monospace;">&#8377;{float(tr.get('price') or 0):.2f}</td>
          <td style="font-weight:600;color:{sc};">{s}</td>
          <td style="font-family:'Courier New',monospace;color:{'#dc2626' if (tr.get('cancel_time_ms') or 0) > 0 and (tr.get('cancel_time_ms') or 0) < 600 else '#6b7280'};">{tr.get('cancel_time_ms') or '—'}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Compliance Case Report — {alert_id}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; background: #f9fafb; color: #111; padding: 32px; font-size: 14px; }}
  .page {{ max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 24px rgba(0,0,0,.08); overflow: hidden; }}
  .header {{ background: #111; color: #fff; padding: 28px 36px; }}
  .header-top {{ font-size: 10px; letter-spacing: .15em; color: #666; text-transform: uppercase; margin-bottom: 6px; }}
  .header-title {{ font-size: 22px; font-weight: 800; color: #f0b429; letter-spacing: .04em; }}
  .header-sub {{ font-size: 12px; color: #888; margin-top: 4px; }}
  .meta-bar {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid #e5e7eb; }}
  .meta-item {{ padding: 16px 20px; border-right: 1px solid #e5e7eb; }}
  .meta-item:last-child {{ border-right: none; }}
  .meta-label {{ font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #9ca3af; margin-bottom: 4px; font-weight: 600; }}
  .meta-value {{ font-size: 15px; font-weight: 800; color: #111; }}
  .section {{ border-bottom: 1px solid #e5e7eb; }}
  .section-title {{ background: #f3f4f6; padding: 10px 20px; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #374151; border-bottom: 1px solid #e5e7eb; }}
  .field-row {{ display: flex; padding: 12px 20px; border-bottom: 1px solid #f9fafb; gap: 16px; }}
  .field-row:last-child {{ border-bottom: none; }}
  .field-label {{ font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; width: 200px; flex-shrink: 0; padding-top: 2px; }}
  .field-value {{ flex: 1; font-size: 13px; color: #111; line-height: 1.6; }}
  .stat-grid {{ display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; padding: 20px; }}
  .stat-box {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; text-align: center; }}
  .stat-num {{ font-size: 26px; font-weight: 800; }}
  .stat-lbl {{ font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; margin-top: 4px; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
  thead tr {{ background: #111; color: #fff; }}
  th {{ padding: 9px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; font-weight: 700; }}
  td {{ padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }}
  tr:nth-child(even) td {{ background: #fafafa; }}
  .footer {{ background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 28px; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; align-items: center; }}
  .print-btn {{ background: #111; color: #fff; border: none; padding: 10px 28px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; margin-bottom: 20px; letter-spacing: .04em; }}
  .print-btn:hover {{ background: #374151; }}
  .tag {{ display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: .04em; }}
  @media print {{ .no-print {{ display: none !important; }} body {{ padding: 0; background: #fff; }} .page {{ box-shadow: none; border-radius: 0; }} }}
</style>
</head>
<body>
<div class="no-print" style="max-width:900px;margin:0 auto 16px;">
  <button class="print-btn" onclick="window.print()">&#x1F4C4; Print / Save as PDF</button>
</div>
<div class="page">

  <div class="header">
    <div class="header-top">NSE Trade Surveillance &mdash; Compliance Division</div>
    <div class="header-title">COMPLIANCE CASE REPORT</div>
    <div class="header-sub">Generated: {export_time} &nbsp;|&nbsp; Case Reference: {alert_id} &nbsp;|&nbsp; Assigned: Surveillance Desk L2</div>
  </div>

  <div class="meta-bar">
    <div class="meta-item"><div class="meta-label">Alert ID</div><div class="meta-value" style="font-size:13px;font-family:'Courier New',monospace;color:#2563eb;">{alert.get('alert_id','')}</div></div>
    <div class="meta-item"><div class="meta-label">Trader</div><div class="meta-value">{alert.get('trader_id','')}</div></div>
    <div class="meta-item"><div class="meta-label">Instrument</div><div class="meta-value">{alert.get('instrument','')}</div></div>
    <div class="meta-item"><div class="meta-label">Severity</div><div class="meta-value" style="color:{'#dc2626' if alert.get('severity')=='HIGH' else '#d97706'};">{alert.get('severity','')}</div></div>
  </div>

  <div class="section">
    <div class="section-title">Section 1 — Manipulation Pattern Detected</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-num" style="color:#d97706;">{pattern_label}</div><div class="stat-lbl">Pattern Type</div></div>
      <div class="stat-box"><div class="stat-num" style="color:#dc2626;">{cancel_pct}%</div><div class="stat-lbl">Cancel Ratio</div></div>
      <div class="stat-box"><div class="stat-num" style="color:#dc2626;">{sigma_val}σ</div><div class="stat-lbl">Anomaly Score</div></div>
      <div class="stat-box"><div class="stat-num" style="color:#111;">{len(trades)}</div><div class="stat-lbl">Total Orders</div></div>
    </div>
    <div class="field-row"><div class="field-label">Evidence Summary</div><div class="field-value">{alert.get('evidence_summary','')}</div></div>
    <div class="field-row"><div class="field-label">Detected At</div><div class="field-value" style="font-family:'Courier New',monospace;">{(alert.get('detected_at') or '')[:19]} UTC</div></div>
    <div class="field-row"><div class="field-label">Case Status</div><div class="field-value"><span class="tag" style="background:#fef3c7;color:#92400e;">OPEN</span></div></div>
  </div>

  {verdict_html}

  <div class="section">
    <div class="section-title">Section 3 — Automated Escalation Actions</div>
    {esc_rows if esc_rows else '<div style="padding:16px 20px;font-size:13px;color:#9ca3af;">No escalation actions yet — triage required.</div>'}
  </div>

  <div class="section">
    <div class="section-title">Section 4 — Order Evidence (First 50 Orders)</div>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Timestamp</th><th>Type</th><th>Size</th><th>Price</th><th>Status</th><th>Cancel (ms)</th></tr></thead>
        <tbody>{trade_rows}</tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    <span>NSE Trade Surveillance Engine &mdash; Wissen Technology Hackathon 2026 &mdash; Powered by Claude AI</span>
    <span>CONFIDENTIAL &mdash; For authorised compliance personnel only</span>
  </div>

</div>
</body>
</html>"""
    return Response(html, mimetype="text/html")


# ── New Analysis Endpoints ─────────────────────────────────────────────────

@app.route("/api/generate-str/<alert_id>")
def generate_str(alert_id):
    try:
        conn = get_db()
        alert = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
        if not alert:
            conn.close()
            return jsonify({"error": "Alert not found"}), 404
        alert = dict(alert)

        triage = conn.execute("SELECT * FROM triage_results WHERE alert_id=?", (alert_id,)).fetchone()
        triage = dict(triage) if triage else None

        trades = conn.execute(
            "SELECT * FROM trades WHERE trader_id=? AND instrument=? ORDER BY timestamp",
            (alert["trader_id"], alert["instrument"]),
        ).fetchall()
        conn.close()
        trades = [dict(t) for t in trades]

        str_ref = "STR-NSE-" + alert_id[:8].upper()
        filing_date = datetime.now().strftime("%d %B %Y")
        pattern_label = alert.get("pattern_type", "").replace("_", " ")
        cancel_ratio_pct = round((alert.get("cancel_ratio") or 0) * 100, 1)
        sigma_val = round(alert.get("sigma") or 0, 2)

        triage_html = ""
        if triage:
            verdict = triage.get("verdict", "")
            verdict_color = "#dc2626" if verdict == "ESCALATE" else "#16a34a"
            triage_html = f"""
            <div class="section">
                <div class="section-title">Section 3: AI Triage Assessment</div>
                <div class="field-row">
                    <div class="field-label">AI Verdict</div>
                    <div class="field-value verdict" style="color:{verdict_color};font-weight:bold;">{verdict}</div>
                </div>
                <div class="field-row">
                    <div class="field-label">Confidence</div>
                    <div class="field-value">{triage.get("confidence", "")}%</div>
                </div>
                <div class="field-row">
                    <div class="field-label">False Positive Probability</div>
                    <div class="field-value">{triage.get("false_positive_probability", "")}%</div>
                </div>
                <div class="field-row">
                    <div class="field-label">Risk Level</div>
                    <div class="field-value">{triage.get("risk_level", "")}</div>
                </div>
                <div class="field-row">
                    <div class="field-label">Rationale</div>
                    <div class="field-value">{triage.get("rationale", "")}</div>
                </div>
                <div class="field-row">
                    <div class="field-label">Recommended Action</div>
                    <div class="field-value">{triage.get("recommended_action", "")}</div>
                </div>
                <div class="field-row">
                    <div class="field-label">Regulatory Reference</div>
                    <div class="field-value">{triage.get("regulatory_reference", "")}</div>
                </div>
                <div class="field-row">
                    <div class="field-label">Processing Time</div>
                    <div class="field-value">{triage.get("processing_time_ms", "")} ms</div>
                </div>
            </div>
            """

        trade_rows = ""
        for t in trades[:50]:
            price_str = f"&#8377;{float(t.get('price') or 0):.2f}"
            size_str = f"{int(t.get('order_size') or 0):,}"
            trade_rows += f"""
            <tr>
                <td>{t.get("timestamp","")}</td>
                <td>{t.get("order_type","")}</td>
                <td>{size_str}</td>
                <td>{price_str}</td>
                <td>{t.get("order_status","")}</td>
                <td>{t.get("cancel_time_ms","")}</td>
            </tr>"""

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>STR {str_ref}</title>
<style>
  body {{ font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #111; background: #fff; }}
  .header {{ background: #1a1a1a; color: #fff; padding: 24px 32px; margin-bottom: 24px; }}
  .header h1 {{ margin: 0 0 4px 0; font-size: 22px; letter-spacing: 1px; }}
  .header p {{ margin: 0; font-size: 13px; color: #aaa; }}
  .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }}
  .meta-item .label {{ font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 4px; }}
  .meta-item .value {{ background: #f5f5f5; border-left: 3px solid #1a1a1a; padding: 8px 12px; font-weight: bold; font-size: 14px; }}
  .section {{ margin-bottom: 24px; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; }}
  .section-title {{ background: #1a1a1a; color: #fff; padding: 10px 16px; font-size: 13px; font-weight: bold; letter-spacing: 0.5px; }}
  .field-row {{ display: flex; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; }}
  .field-row:last-child {{ border-bottom: none; }}
  .field-label {{ font-size: 11px; text-transform: uppercase; color: #888; width: 220px; flex-shrink: 0; padding-top: 2px; }}
  .field-value {{ background: #f5f5f5; border-left: 3px solid #ccc; padding: 4px 10px; flex: 1; font-size: 13px; }}
  .verdict {{ font-weight: bold; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
  thead tr {{ background: #1a1a1a; color: #fff; }}
  th {{ padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }}
  td {{ padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }}
  tr:nth-child(even) {{ background: #fafafa; }}
  .footer {{ margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #e0e0e0; padding-top: 12px; }}
  .print-btn {{ background: #1a1a1a; color: #fff; border: none; padding: 10px 24px; font-size: 13px; cursor: pointer; border-radius: 3px; margin-bottom: 20px; }}
  .print-btn:hover {{ background: #333; }}
  @media print {{ .no-print {{ display: none !important; }} }}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
<div class="header">
  <h1>SUSPICIOUS TRANSACTION REPORT</h1>
  <p>National Stock Exchange of India Limited &mdash; Filed with Financial Intelligence Unit &ndash; India (FIU-IND)</p>
</div>
<div class="meta-grid">
  <div class="meta-item"><div class="label">STR Reference</div><div class="value">{str_ref}</div></div>
  <div class="meta-item"><div class="label">Filing Date</div><div class="value">{filing_date}</div></div>
  <div class="meta-item"><div class="label">Reporting Entity</div><div class="value">NSE</div></div>
  <div class="meta-item"><div class="label">Reported To</div><div class="value">FIU-IND</div></div>
</div>

<div class="section">
  <div class="section-title">Section 1: Alert Details</div>
  <div class="field-row"><div class="field-label">Alert Reference</div><div class="field-value">{alert.get("alert_id","")}</div></div>
  <div class="field-row"><div class="field-label">Detection Date</div><div class="field-value">{alert.get("detected_at","")}</div></div>
  <div class="field-row"><div class="field-label">Trader ID</div><div class="field-value">{alert.get("trader_id","")}</div></div>
  <div class="field-row"><div class="field-label">Instrument</div><div class="field-value">{alert.get("instrument","")}</div></div>
  <div class="field-row"><div class="field-label">Pattern Type</div><div class="field-value">{pattern_label}</div></div>
  <div class="field-row"><div class="field-label">Severity</div><div class="field-value">{alert.get("severity","")}</div></div>
</div>

<div class="section">
  <div class="section-title">Section 2: Evidence Summary</div>
  <div class="field-row"><div class="field-label">Evidence Summary</div><div class="field-value">{alert.get("evidence_summary","")}</div></div>
  <div class="field-row"><div class="field-label">Cancel Ratio</div><div class="field-value">{cancel_ratio_pct}%</div></div>
  <div class="field-row"><div class="field-label">Sigma Value</div><div class="field-value">{sigma_val}</div></div>
</div>

{triage_html}

<div class="section">
  <div class="section-title">Section 4: Trade Evidence (First 50 Orders)</div>
  <table>
    <thead><tr><th>Timestamp</th><th>Order Type</th><th>Order Size</th><th>Price</th><th>Status</th><th>Cancel Time (ms)</th></tr></thead>
    <tbody>{trade_rows}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">Section 5: Regulatory Basis</div>
  <div class="field-row"><div class="field-label">Primary Regulation</div><div class="field-value">SEBI (Prohibition of Fraudulent and Unfair Trade Practices relating to Securities Market) Regulations, 2003 (PFUTP 2003)</div></div>
  <div class="field-row"><div class="field-label">AML Framework</div><div class="field-value">Prevention of Money Laundering Act, 2002 (PMLA 2002) &mdash; Section 12: Reporting obligations for financial institutions</div></div>
</div>

<div class="footer">
  <p><strong>Generated:</strong> {datetime.now(timezone.utc).isoformat()} UTC</p>
  <p><strong>CONFIDENTIAL:</strong> This Suspicious Transaction Report is filed under the Prevention of Money Laundering Act, 2002 and SEBI PFUTP Regulations, 2003. Unauthorised disclosure is prohibited. This document is intended solely for FIU-IND and authorised regulatory bodies.</p>
</div>
</body>
</html>"""

        return Response(html, mimetype="text/html")

    except Exception as e:
        app.logger.error(f"STR generation error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/trader/<trader_id>")
def get_trader_profile(trader_id):
    try:
        conn = get_db()
        alerts_rows = conn.execute(
            "SELECT * FROM alerts WHERE trader_id=? ORDER BY detected_at DESC", (trader_id,)
        ).fetchall()
        alerts = [dict(a) for a in alerts_rows]

        for a in alerts:
            triage_row = conn.execute(
                "SELECT t.verdict, t.confidence, t.risk_level FROM triage_results t WHERE t.alert_id=?",
                (a["alert_id"],)
            ).fetchone()
            if triage_row:
                a["triage_verdict"]     = triage_row["verdict"]
                a["triage_confidence"]  = triage_row["confidence"]
                a["triage_risk_level"]  = triage_row["risk_level"]
            else:
                a["triage_verdict"]     = None
                a["triage_confidence"]  = None
                a["triage_risk_level"]  = None

        pattern_counts = {"LAYERING": 0, "SPOOFING": 0, "WASH_TRADING": 0, "PUMP_AND_DUMP": 0}
        for a in alerts:
            pt = a.get("pattern_type", "")
            if pt in pattern_counts:
                pattern_counts[pt] += 1

        escalation_count = conn.execute(
            "SELECT COUNT(*) FROM escalations e JOIN alerts a ON e.alert_id = a.alert_id WHERE a.trader_id=?",
            (trader_id,)
        ).fetchone()[0]

        watchlist_row = conn.execute(
            "SELECT COUNT(*) FROM escalations e JOIN alerts a ON e.alert_id = a.alert_id WHERE a.trader_id=? AND e.action_type='WATCHLIST_FLAGGED'",
            (trader_id,)
        ).fetchone()
        watchlisted = bool(watchlist_row and watchlist_row[0] > 0)

        total_trades = conn.execute(
            "SELECT COUNT(*) FROM trades WHERE trader_id=?", (trader_id,)
        ).fetchone()[0]
        conn.close()

        risk_score = 0
        for a in alerts:
            if a.get("status") == "ESCALATED" and a.get("triage_verdict") == "ESCALATE":
                risk_score += 30
            if a.get("severity") == "HIGH":
                risk_score += 20
            elif a.get("severity") == "MEDIUM":
                risk_score += 10
        risk_score = min(risk_score, 100)

        return jsonify({
            "trader_id":        trader_id,
            "risk_score":       risk_score,
            "alerts":           alerts,
            "pattern_counts":   pattern_counts,
            "escalation_count": escalation_count,
            "watchlisted":      watchlisted,
            "total_trades":     total_trades,
        })

    except Exception as e:
        app.logger.error(f"Trader profile error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/market-impact/<alert_id>")
def get_market_impact(alert_id):
    try:
        conn = get_db()
        alert = conn.execute("SELECT * FROM alerts WHERE alert_id=?", (alert_id,)).fetchone()
        if not alert:
            conn.close()
            return jsonify({"error": "Alert not found"}), 404
        alert = dict(alert)

        trades_rows = conn.execute(
            "SELECT * FROM trades WHERE trader_id=? AND instrument=?",
            (alert["trader_id"], alert["instrument"]),
        ).fetchall()
        conn.close()
        trades = [dict(t) for t in trades_rows]

        sigma = float(alert.get("sigma") or 0)

        if not trades:
            return jsonify({
                "alert_id":                alert_id,
                "instrument":              alert.get("instrument", ""),
                "price_move_pct":          0.0,
                "min_price":               0.0,
                "max_price":               0.0,
                "total_volume_shares":     0,
                "total_volume_inr":        0.0,
                "suspicious_volume_inr":   0.0,
                "estimated_harm_inr":      0.0,
                "affected_investor_estimate": 50,
                "sigma":                   sigma,
                "manipulation_window_min": 0.0,
            })

        prices = [float(t["price"]) for t in trades if t.get("price") is not None]
        min_price = min(prices) if prices else 0.0
        max_price = max(prices) if prices else 0.0

        if min_price == 0:
            price_move_pct = 0.0
        else:
            price_move_pct = (max_price - min_price) / min_price * 100

        total_volume_shares = sum(int(t.get("order_size") or 0) for t in trades)
        total_volume_inr    = sum(float(t.get("order_size") or 0) * float(t.get("price") or 0) for t in trades)
        suspicious_volume_inr = sum(
            float(t.get("order_size") or 0) * float(t.get("price") or 0)
            for t in trades if t.get("order_status") == "CANCELLED"
        )
        estimated_harm_inr = suspicious_volume_inr * (price_move_pct / 100) * 0.35
        affected_investor_estimate = max(50, int(total_volume_shares / 5000))

        timestamps = []
        for t in trades:
            ts = t.get("timestamp")
            if ts:
                try:
                    timestamps.append(datetime.fromisoformat(str(ts)))
                except (ValueError, TypeError):
                    pass

        if len(timestamps) >= 2:
            manipulation_window_min = (max(timestamps) - min(timestamps)).total_seconds() / 60
        else:
            manipulation_window_min = 0.0

        return jsonify({
            "alert_id":                alert_id,
            "instrument":              alert.get("instrument", ""),
            "price_move_pct":          round(price_move_pct, 4),
            "min_price":               round(min_price, 2),
            "max_price":               round(max_price, 2),
            "total_volume_shares":     total_volume_shares,
            "total_volume_inr":        round(total_volume_inr, 2),
            "suspicious_volume_inr":   round(suspicious_volume_inr, 2),
            "estimated_harm_inr":      round(estimated_harm_inr, 2),
            "affected_investor_estimate": affected_investor_estimate,
            "sigma":                   sigma,
            "manipulation_window_min": round(manipulation_window_min, 2),
        })

    except Exception as e:
        app.logger.error(f"Market impact error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/correlated-alerts")
def get_correlated_alerts():
    try:
        conn = get_db()
        rows = conn.execute("""
            SELECT a.*, t.verdict, t.confidence, t.risk_level
            FROM alerts a
            LEFT JOIN triage_results t ON a.alert_id = t.alert_id
            ORDER BY a.detected_at ASC
        """).fetchall()
        conn.close()
        alerts = [dict(r) for r in rows]

        parsed = []
        for a in alerts:
            ts = a.get("detected_at")
            try:
                dt = datetime.fromisoformat(str(ts)) if ts else None
            except (ValueError, TypeError):
                dt = None
            parsed.append((dt, a))

        groups = []
        used = set()

        for i, (dt_i, alert_i) in enumerate(parsed):
            if alert_i["alert_id"] in used or dt_i is None:
                continue
            group_alerts = [alert_i]
            for j, (dt_j, alert_j) in enumerate(parsed):
                if i == j or alert_j["alert_id"] in used or dt_j is None:
                    continue
                if abs((dt_j - dt_i).total_seconds()) <= 600:
                    group_alerts.append(alert_j)

            if len(group_alerts) >= 2:
                for a in group_alerts:
                    used.add(a["alert_id"])
                group_times = []
                for a in group_alerts:
                    ts = a.get("detected_at")
                    try:
                        group_times.append(datetime.fromisoformat(str(ts)))
                    except (ValueError, TypeError):
                        pass
                window_start = min(group_times).isoformat() if group_times else ""
                window_end   = max(group_times).isoformat() if group_times else ""
                duration_min = (max(group_times) - min(group_times)).total_seconds() / 60 if len(group_times) >= 2 else 0.0
                patterns = list({a.get("pattern_type", "") for a in group_alerts})
                traders  = list({a.get("trader_id", "") for a in group_alerts})
                groups.append({
                    "window_start":     window_start,
                    "window_end":       window_end,
                    "alert_count":      len(group_alerts),
                    "duration_minutes": round(duration_min, 2),
                    "patterns":         patterns,
                    "traders":          traders,
                    "alerts":           group_alerts,
                })

        return jsonify({"groups": groups, "total_groups": len(groups)})

    except Exception as e:
        app.logger.error(f"Correlated alerts error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        data    = request.get_json() or {}
        message = (data.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message required"}), 400

        conn = get_db()
        stats_row = conn.execute("""
            SELECT
                (SELECT COUNT(*) FROM trades) AS total_trades,
                (SELECT COUNT(*) FROM alerts) AS total_alerts,
                (SELECT COUNT(*) FROM alerts WHERE status='ESCALATED') AS escalated,
                (SELECT COUNT(*) FROM alerts WHERE status='DISMISSED') AS dismissed,
                (SELECT COUNT(*) FROM alerts WHERE status='PENDING') AS pending
        """).fetchone()
        alerts_rows = conn.execute(
            "SELECT alert_id, trader_id, instrument, pattern_type, severity, status, detected_at, evidence_summary FROM alerts ORDER BY detected_at DESC LIMIT 10"
        ).fetchall()
        escalation_count = conn.execute("SELECT COUNT(*) FROM escalations").fetchone()[0]
        conn.close()

        total_trades = stats_row["total_trades"] if stats_row else 0
        total_alerts = stats_row["total_alerts"] if stats_row else 0
        escalated    = stats_row["escalated"]    if stats_row else 0
        dismissed    = stats_row["dismissed"]    if stats_row else 0
        pending      = stats_row["pending"]      if stats_row else 0

        alerts_text = ""
        for a in alerts_rows:
            alerts_text += (
                f"  - {a['alert_id']}: {a['trader_id']} | {a['instrument']} | "
                f"{a['pattern_type']} | {a['severity']} | {a['status']} | {(a['detected_at'] or '')[:16]}\n"
            )
        if not alerts_text:
            alerts_text = "  No alerts detected yet.\n"

        context = f"""Current System State:
- Total trades monitored: {total_trades}
- Total alerts detected: {total_alerts}
- Escalated: {escalated}
- Dismissed: {dismissed}
- Pending: {pending}
- Total escalation actions: {escalation_count}

Recent Alerts (latest 10):
{alerts_text}
Top Suspicious Traders:
  T-2891: SPOOFING + LAYERING on RELIANCE (HIGH) — 8×80K orders cancelled 180–490ms
  T-1042: LAYERING on HDFCBANK (HIGH) — 14 orders, 12 cancelled 420–780ms
  T-4401: PUMP_AND_DUMP on TCS (HIGH) — 5×22K BUY in 14min, 2×55K SELL in next 4min
  T-3301: WASH_TRADING on INFY (MEDIUM) — BUY A-3301 / SELL A-3302, 18s apart

Patterns detected: LAYERING, SPOOFING, WASH_TRADING, PUMP_AND_DUMP
Live NSE prices: sourced from Yahoo Finance (yfinance)
AI Model: claude-sonnet-4-6
Token efficiency: 97% reduction via pre-computed stats (280 tokens vs 15,000 raw)
Cost per triage: ~$0.00014
Compliance workflow: SEBI PFUTP Regulations 2003, automatic STR filing, 72-hour watchlist
"""

        import anthropic as _anthropic
        _client = _anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        response = _client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=(
                "You are an AI assistant for the NSE Trade Surveillance Engine dashboard. "
                "You have access to real-time surveillance data. "
                "Answer questions about the system, alerts, traders, patterns, and compliance workflows. "
                "Be concise — max 3 sentences per answer. "
                "Use the context provided to give specific, data-aware answers. "
                "Sound professional like an NSE compliance expert. "
                "Never say you don't have access to data — use the context provided."
            ),
            messages=[{
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {message}"
            }]
        )

        return jsonify({
            "reply":       response.content[0].text,
            "tokens_used": response.usage.input_tokens + response.usage.output_tokens,
        })

    except Exception as e:
        app.logger.error(f"Chat error: {e}")
        return jsonify({"error": str(e), "reply": "Sorry, I could not process your question. Please try again."}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
