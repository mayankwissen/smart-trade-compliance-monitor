import logging
import time
import threading
from datetime import datetime, timezone
from database import get_db
from detector import run_all_detectors

_last_check_time = None
_agent_running = False


def run_watchlist_agent():
    global _agent_running
    _agent_running = True
    while True:
        try:
            _agent_check_cycle()
        except Exception as e:
            logging.error(f"Agent cycle error: {e}")
        time.sleep(300)  # every 5 minutes


def _agent_check_cycle():
    global _last_check_time
    _last_check_time = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    conn = get_db()
    watchlisted = conn.execute(
        "SELECT trader_id, flagged_at, expires_at, reason FROM watchlist WHERE is_active = 1"
    ).fetchall()
    conn.close()

    if not watchlisted:
        _log_agent_action('ALL', 'IDLE', 0, 'No active watchlist entries', 'NONE')
        return

    for trader in watchlisted:
        _monitor_trader(trader['trader_id'])


def _monitor_trader(trader_id):
    try:
        conn = get_db()
        trades = conn.execute(
            "SELECT * FROM trades WHERE trader_id = ? ORDER BY timestamp DESC",
            (trader_id,)
        ).fetchall()
        conn.close()

        if not trades:
            _log_agent_action(trader_id, 'CHECKED', 0, 'No trades found', 'NONE')
            return

        trades_list = [dict(t) for t in trades]
        instruments = list(set(t['instrument'] for t in trades_list))

        new_alerts = []
        for instrument in instruments:
            alerts = run_all_detectors(trader_id, instrument, trades_list)
            if alerts:
                new_alerts.extend(alerts)

        if not new_alerts:
            _log_agent_action(
                trader_id, 'CHECKED', 0,
                f'No new suspicious activity on {", ".join(instruments)}',
                'NONE'
            )
            return

        # New suspicious activity — save alerts and auto-triage
        conn = get_db()
        saved = 0
        for alert in new_alerts:
            existing = conn.execute(
                "SELECT alert_id FROM alerts WHERE trader_id=? AND instrument=? AND pattern_type=?",
                (alert['trader_id'], alert['instrument'], alert['pattern_type'])
            ).fetchone()

            if not existing:
                conn.execute(
                    """INSERT INTO alerts
                      (alert_id, detected_at, trader_id, instrument, pattern_type,
                       severity, evidence_summary, cancel_ratio, sigma, status, source)
                      VALUES (?,?,?,?,?,?,?,?,?,'PENDING','WATCHLIST_AGENT')""",
                    (
                        alert['alert_id'], alert['detected_at'], alert['trader_id'],
                        alert['instrument'], alert['pattern_type'], alert['severity'],
                        alert['evidence_summary'], alert['cancel_ratio'], alert['sigma'],
                    )
                )
                saved += 1
                conn.commit()

                try:
                    from triage import triage_alert
                    from workflows import run_escalation_workflow
                    triage_result = triage_alert(alert)
                    run_escalation_workflow(alert, triage_result)
                except Exception as e:
                    logging.error(f"Auto-triage failed for {alert['alert_id']}: {e}")

        conn.close()

        _log_agent_action(
            trader_id, 'ALERT_CREATED' if saved > 0 else 'CHECKED',
            saved,
            f'Agent detected {saved} new suspicious patterns for {trader_id}' if saved > 0 else f'No new patterns for {trader_id}',
            'TRIAGE_AND_ESCALATE' if saved > 0 else 'NONE'
        )

    except Exception as e:
        logging.error(f"Monitor trader {trader_id}: {e}")
        _log_agent_action(trader_id, 'ERROR', 0, str(e), 'NONE')


def _log_agent_action(trader_id, status, alerts_found, message, action_taken):
    try:
        conn = get_db()
        conn.execute(
            """INSERT INTO agent_logs
              (checked_at, trader_id, status, alerts_found, message, action_taken)
              VALUES (?, ?, ?, ?, ?, ?)""",
            (
                datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                trader_id, status, alerts_found, message, action_taken,
            )
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logging.error(f"Log agent action: {e}")


def get_agent_status():
    conn = get_db()
    traders_monitored = conn.execute(
        "SELECT COUNT(*) FROM watchlist WHERE is_active=1"
    ).fetchone()[0]
    last_log = conn.execute(
        "SELECT checked_at FROM agent_logs ORDER BY id DESC LIMIT 1"
    ).fetchone()
    total_created = conn.execute(
        "SELECT COALESCE(SUM(alerts_found),0) FROM agent_logs WHERE status='ALERT_CREATED'"
    ).fetchone()[0]
    conn.close()
    return {
        "status": "RUNNING" if _agent_running else "STOPPED",
        "traders_monitored": traders_monitored,
        "last_check": last_log["checked_at"] if last_log else None,
        "total_alerts_created": total_created,
        "check_interval_minutes": 5,
    }


def trigger_check():
    """Run one cycle immediately (called from API endpoint)."""
    _agent_check_cycle()


def start_agent():
    thread = threading.Thread(target=run_watchlist_agent, daemon=True, name='WatchlistAgent')
    thread.start()
    logging.info("Watchlist AI Agent started — checking every 5 minutes")
    return thread
