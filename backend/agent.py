import logging
import time
import threading
import sqlite3
from datetime import datetime, timezone
from database import get_db
from detector import run_all_detectors

_stop_event = threading.Event()
_agent_thread = None
MAX_RETRIES = 3


def run_watchlist_agent():
    while not _stop_event.is_set():
        try:
            _agent_check_cycle()
        except Exception as e:
            logging.error(f"Agent cycle error: {e}")
        for _ in range(300):
            if _stop_event.is_set():
                break
            time.sleep(1)


def _db_with_retry(fn):
    """Run fn(conn) with retry on SQLite locked errors."""
    for attempt in range(MAX_RETRIES):
        conn = None
        try:
            conn = get_db()
            conn.execute("PRAGMA busy_timeout=10000")
            result = fn(conn)
            conn.close()
            return result
        except sqlite3.OperationalError as e:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            if "locked" in str(e) and attempt < MAX_RETRIES - 1:
                time.sleep(2)
                continue
            raise
        except Exception:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            raise


def _agent_check_cycle():
    def _read_watchlist(conn):
        return conn.execute(
            "SELECT trader_id FROM watchlist WHERE is_active = 1"
        ).fetchall()

    watchlisted = _db_with_retry(_read_watchlist)

    if not watchlisted:
        _log_agent_action('ALL', 'IDLE', 0, 'No active watchlist entries', 'NONE')
        return

    for trader in watchlisted:
        _monitor_trader(trader['trader_id'])


def _monitor_trader(trader_id):
    try:
        def _read_trades(conn):
            return conn.execute(
                "SELECT * FROM trades WHERE trader_id = ? ORDER BY timestamp DESC",
                (trader_id,)
            ).fetchall()

        trades = _db_with_retry(_read_trades)

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

        saved = 0
        for alert in new_alerts:
            is_new = False

            def _check_and_insert(conn):
                nonlocal is_new
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
                    conn.commit()
                    is_new = True
                return is_new

            _db_with_retry(_check_and_insert)

            if is_new:
                saved += 1
                try:
                    from triage import triage_alert
                    from workflows import run_escalation_workflow
                    triage_result = triage_alert(alert)
                    run_escalation_workflow(alert, triage_result)
                except Exception as e:
                    logging.error(f"Auto-triage failed for {alert['alert_id']}: {e}")

        _log_agent_action(
            trader_id,
            'ALERT_CREATED' if saved > 0 else 'CHECKED',
            saved,
            f'Agent detected {saved} new suspicious patterns for {trader_id}' if saved > 0
            else f'No new patterns for {trader_id}',
            'TRIAGE_AND_ESCALATE' if saved > 0 else 'NONE'
        )

    except Exception as e:
        logging.error(f"Monitor trader {trader_id}: {e}")
        _log_agent_action(trader_id, 'ERROR', 0, str(e), 'NONE')


def _log_agent_action(trader_id, status, alerts_found, message, action_taken):
    try:
        def _insert(conn):
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
        _db_with_retry(_insert)
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
        "status": "RUNNING" if is_agent_running() else "STOPPED",
        "traders_monitored": traders_monitored,
        "last_check": last_log["checked_at"] if last_log else None,
        "total_alerts_created": total_created,
        "check_interval_minutes": 5,
    }


def trigger_check():
    _agent_check_cycle()


def start_agent():
    global _agent_thread
    _stop_event.clear()
    _agent_thread = threading.Thread(
        target=run_watchlist_agent,
        daemon=True,
        name='WatchlistAgent'
    )
    _agent_thread.start()
    logging.info("Watchlist AI Agent started — checking every 5 minutes")


def stop_agent():
    _stop_event.set()
    logging.info("Agent stop requested")


def is_agent_running():
    return (
        _agent_thread is not None and
        _agent_thread.is_alive() and
        not _stop_event.is_set()
    )
