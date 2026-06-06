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
    "*",
])

with app.app_context():
    init_db()
    seed_from_csv()


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
        "model": "claude-sonnet-4-5",
    })


@app.route("/api/ping")
def ping():
    return jsonify({"status": "awake", "timestamp": datetime.now(timezone.utc).isoformat()})


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
    conn.close()
    if not row:
        return jsonify({"error": "Alert not found"}), 404
    alert = dict(row)
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
    total_calls = conn.execute("SELECT COUNT(*) FROM triage_results").fetchone()[0]
    avg_time_row = conn.execute(
        "SELECT AVG(processing_time_ms) FROM triage_results WHERE processing_time_ms IS NOT NULL"
    ).fetchone()
    avg_time = int(avg_time_row[0] or 2400)
    conn.close()

    input_tokens  = total_calls * 280
    output_tokens = total_calls * 180
    total_tokens  = input_tokens + output_tokens
    cost_usd      = round(total_tokens * 0.000003, 6)

    return jsonify({
        "total_triage_calls": total_calls,
        "total_input_tokens": input_tokens,
        "total_output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_usd": cost_usd,
        "avg_processing_time_ms": avg_time,
        "model": "claude-sonnet-4-5",
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
    escs   = conn.execute("SELECT * FROM escalations WHERE alert_id=?", (alert_id,)).fetchall()
    trades = conn.execute(
        "SELECT * FROM trades WHERE trader_id=? AND instrument=? ORDER BY timestamp",
        (alert["trader_id"], alert["instrument"]),
    ).fetchall()
    conn.close()

    case_data = {
        "alert":       alert,
        "triage":      dict(triage) if triage else None,
        "escalations": [dict(e) for e in escs],
        "trades":      [dict(t) for t in trades],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    filename = f"case-{alert_id}.json"
    return Response(
        json.dumps(case_data, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
