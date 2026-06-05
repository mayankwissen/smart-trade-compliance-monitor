from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os
import uuid
import json
from datetime import datetime

load_dotenv()

from database import init_db, seed_from_csv, get_db, _insert_trade_dicts
from ingestor import load_trades, get_all_trader_instrument_pairs, get_trade_window
from detector import run_all_detectors
from triage import triage_alert
from workflows import run_escalation_workflow
from market_data import fetch_real_prices, generate_realistic_trades

app = Flask(__name__)
CORS(app, origins="*")

with app.app_context():
    init_db()
    seed_from_csv()


@app.route("/api/health")
def health():
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    conn.close()
    return jsonify({
        "status": "ok",
        "trades_loaded": count,
        "version": "1.0.0",
        "model": "claude-sonnet-4-20250514",
    })


@app.route("/api/trades")
def get_trades():
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 50))
    offset = (page - 1) * limit
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM trades ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    conn.close()
    return jsonify({
        "trades": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
    })


@app.route("/api/alerts")
def get_alerts():
    conn = get_db()
    rows = conn.execute("""
        SELECT a.*, t.verdict, t.confidence, t.false_positive_probability, t.rationale
        FROM alerts a
        LEFT JOIN triage_results t ON a.alert_id = t.alert_id
        ORDER BY a.detected_at DESC
    """).fetchall()
    conn.close()
    return jsonify({"alerts": [dict(r) for r in rows]})


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
                existing = conn.execute(
                    "SELECT alert_id FROM alerts WHERE trader_id=? AND instrument=? AND pattern_type=?",
                    (trader_id, instrument, alert["pattern_type"]),
                ).fetchone()
                if not existing:
                    conn.execute(
                        """INSERT INTO alerts
                          (alert_id, detected_at, trader_id, instrument, pattern_type,
                           severity, evidence_summary, cancel_ratio, sigma, status)
                          VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (
                            alert["alert_id"],
                            alert["detected_at"],
                            alert["trader_id"],
                            alert["instrument"],
                            alert["pattern_type"],
                            alert["severity"],
                            alert["evidence_summary"],
                            alert["cancel_ratio"],
                            alert["sigma"],
                            alert["status"],
                        ),
                    )
                    saved_count += 1
        except Exception as e:
            app.logger.error(f"Detection error for {trader_id}/{instrument}: {e}")

    conn.commit()
    conn.close()
    return jsonify({
        "status": "ok",
        "alerts_detected": saved_count,
        "pairs_scanned": len(pairs),
    })


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
        return jsonify({
            "alert": alert,
            "triage": triage_result,
            "escalations": escalation_results,
        })
    except Exception as e:
        app.logger.error(f"Triage error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/triage/<alert_id>", methods=["GET"])
def get_triage(alert_id):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM triage_results WHERE alert_id=?", (alert_id,)
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "No triage result yet"}), 404
    return jsonify(dict(row))


@app.route("/api/escalations")
def get_escalations():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM escalations ORDER BY created_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return jsonify({"escalations": [dict(r) for r in rows]})


@app.route("/api/stats")
def get_stats():
    conn = get_db()
    total_trades = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    total_alerts = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    escalated = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE status='ESCALATED'"
    ).fetchone()[0]
    dismissed = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE status='DISMISSED'"
    ).fetchone()[0]
    pending = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE status='PENDING'"
    ).fetchone()[0]
    high = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE severity='HIGH'"
    ).fetchone()[0]
    layering = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE pattern_type='LAYERING'"
    ).fetchone()[0]
    spoofing = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE pattern_type='SPOOFING'"
    ).fetchone()[0]
    wash = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE pattern_type='WASH_TRADING'"
    ).fetchone()[0]
    conn.close()
    return jsonify({
        "total_trades": total_trades,
        "total_alerts": total_alerts,
        "escalated": escalated,
        "dismissed": dismissed,
        "pending": pending,
        "high_severity": high,
        "patterns": {
            "layering": layering,
            "spoofing": spoofing,
            "wash_trading": wash,
        },
    })


@app.route("/api/market-prices")
def get_market_prices():
    try:
        prices = fetch_real_prices()
        result = {}
        for sym, data in prices.items():
            result[sym] = {
                "current": data["current"],
                "high":    data["high"],
                "low":     data["low"],
                "volume":  data["volume"],
                "source":  data.get("source", "live"),
            }
        return jsonify({"prices": result, "fetched_at": datetime.utcnow().isoformat()})
    except Exception as e:
        app.logger.error(f"Market prices error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/refresh-data")
def refresh_data():
    try:
        prices = fetch_real_prices()
        trades = generate_realistic_trades(prices)
        conn = get_db()
        conn.execute("DELETE FROM trades")
        _insert_trade_dicts(conn, trades)
        count = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        conn.commit()
        conn.close()
        price_summary = {s: d["current"] for s, d in prices.items()}
        return jsonify({
            "status": "ok",
            "trades_inserted": count,
            "prices_used": price_summary,
            "refreshed_at": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        app.logger.error(f"Refresh data error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
