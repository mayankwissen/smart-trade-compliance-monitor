import sqlite3
import os
import csv
import logging

DB_PATH = os.path.join(os.path.dirname(__file__), "surveillance.db")
CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "trades_sample.csv")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    conn.execute("""CREATE TABLE IF NOT EXISTS trades (
        trade_id TEXT PRIMARY KEY,
        timestamp TEXT,
        trader_id TEXT,
        account_id TEXT,
        instrument TEXT,
        order_type TEXT,
        order_size INTEGER,
        price REAL,
        order_status TEXT,
        cancel_time_ms INTEGER,
        session_id TEXT
    )""")

    conn.execute("""CREATE TABLE IF NOT EXISTS alerts (
        alert_id TEXT PRIMARY KEY,
        detected_at TEXT,
        trader_id TEXT,
        instrument TEXT,
        pattern_type TEXT,
        severity TEXT,
        evidence_summary TEXT,
        cancel_ratio REAL,
        sigma REAL,
        status TEXT
    )""")

    conn.execute("""CREATE TABLE IF NOT EXISTS triage_results (
        triage_id TEXT PRIMARY KEY,
        alert_id TEXT,
        verdict TEXT,
        confidence INTEGER,
        false_positive_probability INTEGER,
        rationale TEXT,
        simple_explanation TEXT,
        recommended_action TEXT,
        risk_level TEXT,
        regulatory_reference TEXT,
        processing_time_ms INTEGER,
        created_at TEXT
    )""")

    conn.execute("""CREATE TABLE IF NOT EXISTS escalations (
        escalation_id TEXT PRIMARY KEY,
        alert_id TEXT,
        action_type TEXT,
        payload TEXT,
        created_at TEXT
    )""")

    conn.execute("""CREATE TABLE IF NOT EXISTS subscribers (
        subscriber_id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        active INTEGER DEFAULT 1,
        created_at TEXT
    )""")

    # Migrate existing triage_results table (safe — silently skips existing columns)
    for col, typ in [
        ("simple_explanation",       "TEXT"),
        ("recommended_action",       "TEXT"),
        ("risk_level",               "TEXT"),
        ("regulatory_reference",     "TEXT"),
        ("processing_time_ms",       "INTEGER"),
        ("input_tokens",             "INTEGER"),   # FIX 2: real token tracking
        ("output_tokens",            "INTEGER"),   # FIX 2: real token tracking
    ]:
        try:
            conn.execute(f"ALTER TABLE triage_results ADD COLUMN {col} {typ}")
        except Exception:
            pass

    conn.commit()
    conn.close()


def alert_exists(conn, trader_id, instrument, pattern_type):
    row = conn.execute(
        "SELECT alert_id FROM alerts WHERE trader_id=? AND instrument=? AND pattern_type=?",
        (trader_id, instrument, pattern_type)
    ).fetchone()
    return row is not None


def _insert_trade_dicts(conn, trade_list):
    rows = [(
        t["trade_id"], t["timestamp"], t["trader_id"], t["account_id"],
        t["instrument"], t["order_type"], int(t["order_size"]),
        float(t["price"]), str(t["order_status"]).strip().upper(),
        int(t["cancel_time_ms"]), t["session_id"],
    ) for t in trade_list]
    conn.executemany("""INSERT OR IGNORE INTO trades
        (trade_id, timestamp, trader_id, account_id, instrument, order_type,
         order_size, price, order_status, cancel_time_ms, session_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""", rows)


def seed_from_csv():
    conn = get_db()
    count = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    if count > 0:
        conn.close()
        return

    try:
        from market_data import fetch_real_prices, generate_realistic_trades
        prices = fetch_real_prices()
        if prices:
            trades = generate_realistic_trades(prices)
            _insert_trade_dicts(conn, trades)
            conn.commit()
            conn.close()
            return
    except Exception as e:
        logging.warning(f"yfinance seed failed, falling back to CSV: {e}")

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            rows.append((
                row["trade_id"], row["timestamp"], row["trader_id"],
                row["account_id"], row["instrument"], row["order_type"],
                int(row["order_size"]), float(row["price"]),
                row["order_status"].strip().upper(),
                int(row["cancel_time_ms"]), row["session_id"],
            ))

    conn.executemany("""INSERT OR IGNORE INTO trades
        (trade_id, timestamp, trader_id, account_id, instrument, order_type,
         order_size, price, order_status, cancel_time_ms, session_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""", rows)
    conn.commit()
    conn.close()
