from database import get_db


def load_trades():
    conn = get_db()
    rows = conn.execute("SELECT * FROM trades ORDER BY timestamp").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_trade_window(trader_id, instrument, minutes=10):
    from datetime import timedelta
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM trades WHERE trader_id=? AND instrument=? ORDER BY timestamp",
        (trader_id, instrument)
    ).fetchall()
    conn.close()
    trades = [dict(r) for r in rows]
    if not trades:
        return trades
    from datetime import datetime
    first_ts = datetime.fromisoformat(trades[0]["timestamp"])
    cutoff = first_ts + timedelta(minutes=minutes)
    return [t for t in trades if datetime.fromisoformat(t["timestamp"]) <= cutoff]


def get_all_trader_instrument_pairs():
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT trader_id, instrument FROM trades"
    ).fetchall()
    conn.close()
    return [(r["trader_id"], r["instrument"]) for r in rows]
