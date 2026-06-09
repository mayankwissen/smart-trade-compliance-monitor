import uuid
from collections import defaultdict
from datetime import datetime, timezone


def _now_iso():
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _population_cancel_stats(all_trades):
    """Compute mean and std dev of cancel ratios from all active traders."""
    counts = defaultdict(lambda: [0, 0])  # [cancelled, total]
    for t in all_trades:
        counts[t['trader_id']][1] += 1
        if t['order_status'] == 'CANCELLED':
            counts[t['trader_id']][0] += 1
    ratios = [c[0] / c[1] for c in counts.values() if c[1] >= 5]
    if len(ratios) < 5:
        return 0.15, 0.05
    mean = sum(ratios) / len(ratios)
    variance = sum((r - mean) ** 2 for r in ratios) / len(ratios)
    std = max(variance ** 0.5, 0.01)
    return round(mean, 4), round(std, 4)


def calculate_confidence(cancel_ratio, sigma, cancel_ms, order_size, pattern_type, total_orders):
    """Mathematical confidence score — 5 weighted evidence dimensions, 0–100 each."""
    cr_score    = min(100, max(0, (cancel_ratio - 0.70) / 0.28 * 100))
    sig_score   = min(100, max(0, (sigma - 2.0) / 12.0 * 100))
    if cancel_ms and cancel_ms > 0:
        timing_score = min(100, max(0, (600 - cancel_ms) / 590 * 100))
    else:
        timing_score = 50
    vol_score    = min(100, max(0, (order_size - 10_000) / 70_000 * 100))
    sample_score = min(100, total_orders / 15 * 100)

    weights = {
        'LAYERING':      [0.35, 0.25, 0.20, 0.10, 0.10],
        'SPOOFING':      [0.15, 0.20, 0.30, 0.25, 0.10],
        'WASH_TRADING':  [0.00, 0.00, 0.10, 0.30, 0.60],
        'PUMP_AND_DUMP': [0.00, 0.25, 0.00, 0.40, 0.35],
    }
    w = weights.get(pattern_type, [0.25, 0.25, 0.20, 0.15, 0.15])
    scores = [cr_score, sig_score, timing_score, vol_score, sample_score]
    raw = sum(w[i] * scores[i] for i in range(5))
    return int(min(97, max(52, raw)))


def detect_layering(trades, all_trades=None):
    total = len(trades)
    if total < 5:
        return None

    cancelled = [t for t in trades if t["order_status"] == "CANCELLED"]
    executed_sells = [
        t for t in trades
        if t["order_status"] == "EXECUTED" and t["order_type"] == "SELL"
    ]

    cancel_ratio = len(cancelled) / total
    if cancel_ratio <= 0.55:
        return None
    if len(executed_sells) == 0:
        return None

    cancel_times = [t["cancel_time_ms"] for t in cancelled if t["cancel_time_ms"] > 0]
    median_ms = sorted(cancel_times)[len(cancel_times) // 2] if cancel_times else 0

    pop_mean, pop_std = _population_cancel_stats(all_trades if all_trades else trades)
    sigma = round((cancel_ratio - pop_mean) / pop_std, 2)
    severity = "HIGH" if cancel_ratio > 0.80 else "MEDIUM"

    max_order_size = max((t["order_size"] for t in cancelled), default=1000)
    confidence_hint = calculate_confidence(
        cancel_ratio=cancel_ratio, sigma=sigma, cancel_ms=median_ms,
        order_size=max_order_size, pattern_type='LAYERING', total_orders=total
    )

    return {
        "alert_id": "ALT-" + str(uuid.uuid4())[:8].upper(),
        "detected_at": _now_iso(),
        "trader_id": trades[0]["trader_id"],
        "instrument": trades[0]["instrument"],
        "pattern_type": "LAYERING",
        "severity": severity,
        "evidence_summary": (
            f"Trader placed {total} orders, {len(cancelled)} cancelled "
            f"({cancel_ratio*100:.1f}% ratio) within {median_ms}ms median. "
            f"{len(executed_sells)} sell(s) executed. "
            f"Population baseline: {pop_mean*100:.1f}% ± {pop_std*100:.1f}% — {sigma}σ outlier."
        ),
        "cancel_ratio": round(cancel_ratio, 4),
        "sigma": sigma,
        "confidence_hint": confidence_hint,
        "status": "PENDING",
    }


def detect_spoofing(trades, all_trades=None):
    large_cancelled = [
        t for t in trades
        if t["order_size"] > 40000
        and t["order_status"] == "CANCELLED"
        and t["cancel_time_ms"] > 0
        and t["cancel_time_ms"] < 600
    ]
    if not large_cancelled:
        return None

    worst = min(large_cancelled, key=lambda t: t["cancel_time_ms"])
    spoof_ratio = len(large_cancelled) / len(trades)

    pop_mean, pop_std = _population_cancel_stats(all_trades if all_trades else trades)
    sigma = round(max(0.0, (spoof_ratio - pop_mean) / pop_std), 2)

    max_order_size = max(t["order_size"] for t in large_cancelled)
    confidence_hint = calculate_confidence(
        cancel_ratio=spoof_ratio, sigma=sigma, cancel_ms=worst["cancel_time_ms"],
        order_size=max_order_size, pattern_type='SPOOFING', total_orders=len(trades)
    )

    return {
        "alert_id": "ALT-" + str(uuid.uuid4())[:8].upper(),
        "detected_at": _now_iso(),
        "trader_id": trades[0]["trader_id"],
        "instrument": trades[0]["instrument"],
        "pattern_type": "SPOOFING",
        "severity": "HIGH",
        "evidence_summary": (
            f"{len(large_cancelled)} large order(s) >40K shares placed and cancelled sub-600ms. "
            f"Worst: {worst['order_size']:,} shares cancelled in {worst['cancel_time_ms']}ms. "
            f"Spoof ratio {spoof_ratio*100:.1f}% vs population {pop_mean*100:.1f}% mean — {sigma}σ outlier."
        ),
        "cancel_ratio": round(spoof_ratio, 4),
        "sigma": sigma,
        "confidence_hint": confidence_hint,
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
                bt = datetime.fromisoformat(b["timestamp"])
                st = datetime.fromisoformat(s["timestamp"])
                diff = abs((bt - st).total_seconds())
                size_diff = abs(b["order_size"] - s["order_size"]) / max(
                    b["order_size"], s["order_size"]
                )
                if diff <= 30 and size_diff < 0.10:
                    confidence_hint = calculate_confidence(
                        cancel_ratio=0.0, sigma=10.0, cancel_ms=0,
                        order_size=b["order_size"],
                        pattern_type='WASH_TRADING',
                        total_orders=len(inst_trades)
                    )
                    return {
                        "alert_id": "ALT-" + str(uuid.uuid4())[:8].upper(),
                        "detected_at": _now_iso(),
                        "trader_id": trader_id,
                        "instrument": inst,
                        "pattern_type": "WASH_TRADING",
                        "severity": "MEDIUM",
                        "evidence_summary": (
                            f"Self-dealing: BUY {b['order_size']:,} {inst} on "
                            f"{b['account_id']}, SELL {s['order_size']:,} on {s['account_id']} "
                            f"within {int(diff)}s. Size deviation {size_diff*100:.1f}% — "
                            f"cross-account matched trades signature."
                        ),
                        "cancel_ratio": 0.0,
                        "sigma": 10.0,
                        "confidence_hint": confidence_hint,
                        "status": "PENDING",
                    }
    return None


def detect_pump_and_dump(all_trades, trader_id):
    trader_trades = [t for t in all_trades if t['trader_id'] == trader_id]
    instruments = set(t['instrument'] for t in trader_trades)

    for instrument in instruments:
        inst_trades = [t for t in trader_trades
                       if t['instrument'] == instrument
                       and t['order_status'] == 'EXECUTED']

        buys  = [t for t in inst_trades if t['order_type'] == 'BUY']
        sells = [t for t in inst_trades if t['order_type'] == 'SELL']

        if not buys or not sells:
            continue

        buy_times  = [datetime.fromisoformat(t['timestamp']) for t in buys]
        sell_times = [datetime.fromisoformat(t['timestamp']) for t in sells]

        earliest_buy  = min(buy_times)
        latest_buy    = max(buy_times)
        earliest_sell = min(sell_times)

        buy_window_min = (latest_buy - earliest_buy).total_seconds() / 60
        sell_delay_min = (earliest_sell - latest_buy).total_seconds() / 60

        total_buy_size  = sum(t['order_size'] for t in buys)
        total_sell_size = sum(t['order_size'] for t in sells)

        if (total_buy_size > 50000
                and buy_window_min <= 20
                and 0 <= sell_delay_min <= 10):

            pnd_sigma = round(total_buy_size / 10000, 2)
            confidence_hint = calculate_confidence(
                cancel_ratio=0.0, sigma=pnd_sigma, cancel_ms=0,
                order_size=total_buy_size // max(len(buys), 1),
                pattern_type='PUMP_AND_DUMP',
                total_orders=len(buys) + len(sells)
            )

            return {
                "alert_id":        "ALT-" + str(uuid.uuid4())[:8].upper(),
                "detected_at":     _now_iso(),
                "trader_id":       trader_id,
                "instrument":      instrument,
                "pattern_type":    "PUMP_AND_DUMP",
                "severity":        "HIGH",
                "evidence_summary": (
                    f"Accumulated {total_buy_size:,} shares of {instrument} "
                    f"in {buy_window_min:.1f}min ({len(buys)} orders), "
                    f"distributed {total_sell_size:,} shares within {sell_delay_min:.1f}min. "
                    f"Rapid accumulation-distribution signature ({pnd_sigma}σ intensity)."
                ),
                "cancel_ratio":    0.0,
                "sigma":           pnd_sigma,
                "confidence_hint": confidence_hint,
                "status":          "PENDING",
            }
    return None


def run_all_detectors(trader_id, instrument, all_trades):
    from ingestor import get_trade_window
    window = get_trade_window(trader_id, instrument)
    alerts = []

    r1 = detect_layering(window, all_trades)
    if r1:
        alerts.append(r1)

    r2 = detect_spoofing(window, all_trades)
    if r2:
        alerts.append(r2)

    r3 = detect_wash_trading(all_trades, trader_id)
    if r3:
        alerts.append(r3)

    r4 = detect_pump_and_dump(all_trades, trader_id)
    if r4:
        alerts.append(r4)

    return alerts
