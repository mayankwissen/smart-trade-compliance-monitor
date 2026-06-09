import requests
import os
import logging
from datetime import datetime, timezone

SERVICE_URL = os.getenv(
    'BACKEND_URL',
    'https://smart-trade-compliance-monitor.onrender.com'
)
_start_time = datetime.now(timezone.utc)
_last_heal_actions = []


def check_system_health():
    checks = {}

    try:
        r = requests.get(f"{SERVICE_URL}/api/health", timeout=10)
        checks['api'] = r.status_code == 200
    except Exception:
        checks['api'] = False

    try:
        r = requests.get(f"{SERVICE_URL}/api/stats", timeout=10)
        checks['database'] = r.status_code == 200
    except Exception:
        checks['database'] = False

    try:
        r = requests.get(f"{SERVICE_URL}/api/market-prices", timeout=15)
        data = r.json()
        checks['market_data'] = bool(data.get('prices'))
    except Exception:
        checks['market_data'] = False

    try:
        key = os.getenv('ANTHROPIC_API_KEY', '')
        checks['claude_api'] = bool(key and key.startswith('sk-ant'))
    except Exception:
        checks['claude_api'] = False

    checks['slack'] = bool(os.getenv('SLACK_WEBHOOK_URL'))
    checks['email'] = bool(os.getenv('SENDGRID_API_KEY'))

    return checks


def auto_heal(failed_checks):
    global _last_heal_actions
    healing_actions = []

    if not failed_checks.get('database'):
        try:
            requests.post(f"{SERVICE_URL}/api/db/reset", timeout=30)
            healing_actions.append("Database reset attempted")
        except Exception:
            healing_actions.append("Database reset FAILED")

    if not failed_checks.get('market_data'):
        try:
            requests.post(f"{SERVICE_URL}/api/refresh-data", timeout=30)
            healing_actions.append("Market data refresh triggered")
        except Exception:
            healing_actions.append("Market data refresh FAILED")

    _last_heal_actions = healing_actions
    return healing_actions


def get_uptime_minutes():
    delta = datetime.now(timezone.utc) - _start_time
    return int(delta.total_seconds() / 60)


def get_detailed_health():
    checks = check_system_health()
    failed = {k: v for k, v in checks.items() if not v}

    heal_actions = []
    if failed:
        try:
            heal_actions = auto_heal(failed)
        except Exception as e:
            logging.error(f"Auto-heal error: {e}")

    all_ok = all(checks.values())
    critical_fail = not checks.get('api') or not checks.get('database')

    if critical_fail:
        overall = "critical"
    elif not all_ok:
        overall = "degraded"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "checks": checks,
        "last_checked": datetime.now(timezone.utc).isoformat(),
        "auto_healed": heal_actions,
        "uptime_minutes": get_uptime_minutes(),
    }
