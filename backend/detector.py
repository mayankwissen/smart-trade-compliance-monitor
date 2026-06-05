import uuid
from datetime import datetime
from itertools import combinations


def detect_layering(trades):
    total = len(trades)
    if total < 5:
        return None

    cancelled = [t for t in trades if t["order_status"] == "CANCELLED"]
    executed_sells = [
        t for t in trades
        if t["order_status"] == "EXECUTED" and t["order_type"] == "SELL"
    ]

    cancel_ratio = len(cancelled) / total
    if cancel_ratio <= 0.70:
        return None
    if len(executed_sells) == 0:
        return None

    cancel_times = [t["cancel_time_ms"] for t in cancelled if t["cancel_time_ms"] > 0]
    median_ms = sorted(cancel_times)[len(cancel_times) // 2] if cancel_times else 0

    sigma = round((cancel_ratio - 0.15) / 0.05, 2)
    severity = "HIGH" if cancel_ratio > 0.80 else "MEDIUM"

    return {
        "alert_id": "ALT-" + str(uuid.uuid4())[:8].upper(),
        "detected_at": datetime.utcnow().isoformat(),
        "trader_id": trades[0]["trader_id"],
        "instrument": trades[0]["instrument"],
        "pattern_type": "LAYERING",
        "severity": severity,
        "evidence_summary": (
            f"Trader placed {total} orders, {len(cancelled)} cancelled within "
            f"{median_ms}ms median. {len(executed_sells)} sell(s) executed at elevated price."
        ),
        "cancel_ratio": round(cancel_ratio, 4),
        "sigma": sigma,
        "status": "PENDING",
    }


def detect_spoofing(trades):
    large_cancelled = [
        t for t in trades
        if t["order_size"] > 50000
        and t["order_status"] == "CANCELLED"
        and t["cancel_time_ms"] > 0
        and t["cancel_time_ms"] < 600
    ]
    if not large_cancelled:
        return None

    worst = min(large_cancelled, key=lambda t: t["cancel_time_ms"])

    return {
        "alert_id": "ALT-" + str(uuid.uuid4())[:8].upper(),
        "detected_at": datetime.utcnow().isoformat(),
        "trader_id": trades[0]["trader_id"],
        "instrument": trades[0]["instrument"],
        "pattern_type": "SPOOFING",
        "severity": "HIGH",
        "evidence_summary": (
            f"Large order {worst['order_size']} shares placed and cancelled in "
            f"{worst['cancel_time_ms']}ms. Possible price manipulation."
        ),
        "cancel_ratio": round(len(large_cancelled) / len(trades), 4),
        "sigma": round((len(large_cancelled) / len(trades) - 0.15) / 0.05, 2),
        "status": "PENDING",
    }


def detect_wash_trading(all_trades, trader_id):
    trader_trades = [t for t in all_trades if t["trader_id"] == trader_id]
    accounts = list(set(t["account_id"] for t in trader_trades))
    if len(accounts) < 2:
        return None

    for inst in set(t["instrument"] for t in trader_trades):
        inst_trades = [t for t in trader_trades if t["instrument"] == inst]
        buys = [
            t for t in inst_trades
            if t["order_type"] == "BUY" and t["order_status"] == "EXECUTED"
        ]
        sells = [
            t for t in inst_trades
            if t["order_type"] == "SELL" and t["order_status"] == "EXECUTED"
        ]
        for b in buys:
            for s in sells:
                if b["account_id"] == s["account_id"]:
                    continue
                from datetime import datetime as dt
                bt = dt.fromisoformat(b["timestamp"])
                st = dt.fromisoformat(s["timestamp"])
                diff = abs((bt - st).total_seconds())
                size_diff = abs(b["order_size"] - s["order_size"]) / max(
                    b["order_size"], s["order_size"]
                )
                if diff <= 30 and size_diff < 0.10:
                    return {
                        "alert_id": "ALT-" + str(uuid.uuid4())[:8].upper(),
                        "detected_at": datetime.utcnow().isoformat(),
                        "trader_id": trader_id,
                        "instrument": inst,
                        "pattern_type": "WASH_TRADING",
                        "severity": "MEDIUM",
                        "evidence_summary": (
                            f"Self-dealing: BUY {b['order_size']} {inst} on "
                            f"{b['account_id']}, SELL on {s['account_id']} "
                            f"within {int(diff)}s."
                        ),
                        "cancel_ratio": 0.0,
                        "sigma": 0.0,
                        "status": "PENDING",
                    }
    return None


def run_all_detectors(trader_id, instrument, all_trades):
    from ingestor import get_trade_window
    window = get_trade_window(trader_id, instrument)
    alerts = []

    r1 = detect_layering(window)
    if r1:
        alerts.append(r1)

    r2 = detect_spoofing(window)
    if r2:
        alerts.append(r2)

    r3 = detect_wash_trading(all_trades, trader_id)
    if r3:
        alerts.append(r3)

    return alerts
