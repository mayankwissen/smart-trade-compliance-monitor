# Trade Surveillance & Alert Triage Engine
Wissen Technology Hackathon 2026

An AI-powered real-time trade surveillance system that ingests NSE trade data, detects market manipulation patterns (layering, spoofing, wash trading), and uses Claude Sonnet to autonomously triage alerts into ESCALATE/DISMISS verdicts with full compliance workflows. The engine delivers end-to-end automation — from raw trade data to compliance case creation, Slack notification, email alert, and 72-hour watchlist monitoring — in a single API call.

## Architecture

```
yfinance / CSV → [Ingestor] → [SQLite DB] → [Detector] → [Triage / Claude API] → [Workflows]
                                                               ↓                        ↓
                                                         Verdicts DB          Cases / Slack / Email
```

**Components:**
- `market_data.py` — Fetches real-time NSE prices via yfinance, generates 415 synthetic trades including 3 injected suspicious clusters
- `ingestor.py` — Loads trades from SQLite, provides windowed queries per trader+instrument pair
- `detector.py` — Three deterministic detectors: layering (cancel ratio + sell elevation), spoofing (large rapid cancels), wash trading (cross-account self-dealing)
- `triage.py` — Calls Claude Sonnet with pre-computed evidence (~280 tokens), parses 7-field JSON verdict, tracks processing time
- `workflows.py` — Creates JSON case files, sends Slack block messages, sends HTML emails to subscribers, flags watchlist
- `app.py` — Flask REST API with 20 endpoints, CORS, pagination, filtering
- `database.py` — SQLite schema init, CSV fallback seed, auto-migration for new columns

## Setup — Local

```bash
# 1. Enter backend directory
cd trade-surveillance/backend

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp ../.env.example .env
# Edit .env — set ANTHROPIC_API_KEY (required), SLACK_WEBHOOK_URL (optional)

# 4. Start server
python app.py
# Runs at http://localhost:5000

# 5. Open frontend — no build step needed
# Double-click: trade-surveillance/frontend/index.html
```

## Setup — Render Deployment

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. Set environment variables in the Render dashboard:
   - `ANTHROPIC_API_KEY` — required
   - `SLACK_WEBHOOK_URL` — optional
   - `EMAIL_SENDER` / `EMAIL_PASSWORD` — optional, for email alerts
5. Deploy — build takes ~2 minutes on free tier
6. Open `frontend/index.html` — it auto-detects the Render URL vs localhost

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health, trade count, model version |
| GET | `/api/ping` | Keep-alive for Render free tier |
| GET | `/api/trades` | Paginated trades — filters: trader_id, instrument, status |
| GET | `/api/alerts` | All alerts with triage joined — filters: pattern, severity, status, search |
| GET | `/api/alert/<id>/trades` | All trades for the alert's trader+instrument |
| GET | `/api/alert/<id>/full` | Complete alert + triage + escalations + trades (single call) |
| POST | `/api/replay/start` | Scan all trades, detect patterns, store new alerts |
| POST | `/api/triage/<id>` | AI triage via Claude + full escalation workflow |
| GET | `/api/triage/<id>` | Fetch existing triage result |
| GET | `/api/escalations` | Paginated escalation log |
| GET | `/api/stats` | Dashboard counts (trades, alerts, escalated, dismissed, pending) |
| GET | `/api/token-stats` | Claude API usage — calls, tokens, estimated cost |
| GET | `/api/market-prices` | Live NSE prices for 7 symbols via yfinance |
| POST | `/api/refresh-data` | Regenerate all trades at current market prices |
| POST | `/api/subscribe` | Add email to alert subscriber list |
| POST | `/api/unsubscribe` | Deactivate email subscription |
| GET | `/api/subscribers/count` | Active subscriber count |
| POST/GET | `/api/export/case/<id>` | Download complete case as JSON attachment |

## Suspicious Clusters in the Data

| Cluster | Trader | Instrument | Pattern | What Happened |
|---------|--------|------------|---------|---------------|
| A | T-1042 | HDFCBANK | LAYERING | 14 orders, 12 cancelled in 420–780ms, 2 sells executed at elevated price |
| B | T-2891 | RELIANCE | SPOOFING | 8×80,000-share orders cancelled in 180–490ms, followed by profitable sell |
| C | T-3301 | INFY | WASH TRADING | BUY on A-3301, SELL on A-3302 within 18 seconds, same size |

## Demo Walkthrough

1. **Open** `frontend/index.html` in browser — Stats bar shows **415 trades** loaded
2. **Click ▶ START REPLAY** — backend scans all trades, detects **5 alerts** across 3 patterns
3. **Watch** Alert Feed populate: LAYERING + SPOOFING for T-1042/HDFCBANK, LAYERING + SPOOFING for T-2891/RELIANCE, WASH_TRADING for T-3301/INFY
4. **Click any alert row** — navigates to Alert Detail page
5. **Click "⚡ Triage This Alert"** — Claude Sonnet analyzes in ~2s
6. **See** animated ESCALATE/DISMISS verdict, confidence bar, 4-5 sentence rationale, plain-English explanation, recommended action
7. **Check Escalation Actions tab** — COMPLIANCE CASE created, Slack notified, Watchlist flagged
8. **Go to Alerts page** → **AUTO-TRIAGE ALL** — triages all pending alerts in sequence
9. **Visit Settings page** — see live API usage: total triage calls, tokens consumed, estimated cost
10. **Check `cases/` folder** — each ESCALATE generates a `COMP-XXXX.json` compliance case file

## Token Efficiency

The triage prompt is intentionally compact: evidence is pre-computed by deterministic detectors (cancel ratio, sigma, median cancel time) and passed as structured key-value pairs rather than raw trade rows. This reduces token usage by ~95% versus sending full trade histories to the LLM. Claude receives exactly what it needs to render a verdict — pattern type, severity, quantitative stats, and a single evidence sentence. `max_tokens=500` caps response cost. The Settings page shows live token consumption and estimated cost per triage call.

## Reset / Fresh Demo

```bash
cd backend
del surveillance.db        # Windows
# rm surveillance.db       # Mac/Linux
python app.py              # Reseeds automatically on startup
```
