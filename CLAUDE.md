# Trade Surveillance & Alert Triage Engine

## What this project is
AI-powered NSE trade surveillance system. Ingests trade data, detects manipulation patterns (layering, spoofing, wash trading), and uses Claude Sonnet to triage alerts into ESCALATE/DISMISS verdicts with full compliance workflows.

Built for Wissen Technology Hackathon 2026.

## Model in use
- **Triage AI**: `claude-sonnet-4-20250514` (hardcoded in `backend/triage.py`)
- **Claude Code session**: Sonnet 4.6 (default) — change with `/model` in the CLI

## Current Status — as of last session
- **Backend**: Flask + SQLite, 20+ endpoints, all working
- **Frontend**: Fully restructured multi-file React app, 6 pages, gold/black Bloomberg theme
- **Triage**: Claude Sonnet (CCO persona), SEBI-quality JSON responses with 8 fields
- **Layout**: Fixed sidebar + fixed header, per-page scrolling — works at 100% zoom
- **Deployment**: Render (backend) + Render Static or Vercel (frontend)

## How to run locally

```bash
# Terminal 1 — start backend
cd trade-surveillance/backend
python app.py
# Runs at http://localhost:5000

# Terminal 2 — start frontend (MUST use http-server, not file://)
cd trade-surveillance/frontend
python -m http.server 3000
# Open http://localhost:3000
```

> **Important**: The frontend uses `type="text/babel" src="..."` for external scripts.
> This requires an HTTP server. Opening `index.html` directly from the filesystem (file://) will NOT work.

## Completed Features

| Feature | Status |
|---------|--------|
| 415 synthetic trades with real NSE prices (yfinance) | ✅ |
| 3 pattern detectors: LAYERING, SPOOFING, WASH_TRADING | ✅ |
| Claude AI triage — 8 response fields (verdict, confidence, rationale, risk_level, simple_explanation, recommended_action, regulatory_reference, false_positive_probability) | ✅ |
| Slack notifications on ESCALATE | ✅ |
| Email notifications to subscribers | ✅ |
| Compliance case file creation (COMP-XXXX.json) | ✅ |
| 72-hour watchlist flagging | ✅ |
| Multi-page hash routing: #/ #/alerts #/alert/:id #/trades #/logs #/settings | ✅ |
| Gold/black Bloomberg terminal theme | ✅ |
| Dark/light toggle (localStorage) | ✅ |
| Chart.js: donut (patterns) + bar (severity) | ✅ |
| Top Suspects leaderboard (risk-score ranked) | ✅ |
| Live NSE price ticker (auto-refreshes 60s) | ✅ |
| Token usage stats endpoint | ✅ |
| Export case JSON endpoint | ✅ |
| Fixed layout at 100% zoom (position:fixed sidebar + header) | ✅ |
| Scrollable tables with sticky headers | ✅ |
| Health checks auto-refresh every 30s (Settings page) | ✅ |
| vercel.json for SPA hash routing | ✅ |

## File Structure

```
trade-surveillance/
├── backend/
│   ├── app.py              # Flask REST API — 20+ endpoints
│   ├── triage.py           # Claude API call, SEBI CCO persona, 8-field JSON
│   ├── detector.py         # 3 pattern detectors (layering/spoofing/wash)
│   ├── database.py         # SQLite init + CSV seed
│   ├── ingestor.py         # Trade loader, windowed queries
│   ├── workflows.py        # Case creation, Slack, watchlist
│   ├── market_data.py      # yfinance live NSE prices + trade generation
│   ├── emailer.py          # SMTP email notifications to subscribers
│   ├── Procfile            # gunicorn for Render
│   ├── requirements.txt
│   └── data/
│       └── trades_sample.csv   # 415 rows, 3 injected suspicious clusters
├── frontend/
│   ├── index.html          # Thin loader — loads CSS + 17 JS files via Babel
│   ├── vercel.json         # SPA rewrite: all routes → index.html
│   ├── css/
│   │   └── styles.css      # Fixed layout, gold scrollbar, responsive grid
│   └── js/
│       ├── api.js          # API_BASE, DARK/LIGHT themes, badge configs, formatters
│       ├── app.js          # Root App component, ReactDOM.createRoot
│       ├── components/
│       │   ├── Header.js       # Fixed header, live price ticker, subscribe, replay
│       │   ├── Sidebar.js      # Fixed sidebar, 5 nav items, active indicator
│       │   ├── StatsBar.js     # 5-card stats grid (32px numbers)
│       │   ├── Charts.js       # Chart.js donut + bar (MiniCharts)
│       │   └── TopSuspects.js  # Ranked trader leaderboard
│       └── pages/
│           ├── Dashboard.js    # Alert feed (all paginated), 8 escalations, charts
│           ├── Alerts.js       # Full alert table, filters, auto-triage
│           ├── AlertDetail.js  # Triage verdict, narrative box, 4 info boxes, escalation cards
│           ├── Trades.js       # 415 trades, 5 filters, flagged trader highlighting
│           ├── Logs.js         # Escalation log, CSV export, 5s auto-refresh
│           └── Settings.js     # Architecture diagram, tech stack, API stats, health checks
├── cases/                  # Generated COMP-XXXX.json compliance case files
├── CLAUDE.md               # This file — project memory
├── README.md               # User-facing docs
├── PROMPTS.md              # All AI prompts used to build this project
├── AI_RESPONSES.md         # Real Claude API responses for demo
├── render.yaml             # Render blueprint deploy config
└── .env.example            # ANTHROPIC_API_KEY, SLACK_WEBHOOK_URL, etc.
```

## Key Commands

```bash
# Start backend
cd backend && python app.py

# Start frontend (http server required for Babel external scripts)
cd frontend && python -m http.server 3000

# Install backend dependencies
cd backend && pip install -r requirements.txt

# Reset database (delete + restart to reseed from CSV)
del backend\surveillance.db && python app.py

# Test backend health
curl http://localhost:5000/api/health

# Trigger pattern detection
curl -X POST http://localhost:5000/api/replay/start

# Triage a specific alert
curl -X POST http://localhost:5000/api/triage/ALT-XXXXXXXX

# Commit and push
git add -A && git commit -m "message" && git push
```

## Environment Variables (backend/.env)

```
ANTHROPIC_API_KEY=sk-ant-...       # Required — Claude triage
SLACK_WEBHOOK_URL=https://...      # Optional — Slack notifications
EMAIL_SENDER=you@gmail.com         # Optional — email notifications
EMAIL_PASSWORD=app-password        # Optional — Gmail app password
PORT=5000                          # Optional — defaults to 5000
```
Copy from `.env.example` and fill in `ANTHROPIC_API_KEY` at minimum.

## Database

SQLite at `backend/surveillance.db` (auto-created on first run).
4 tables: `trades`, `alerts`, `triage_results`, `escalations`.
To reset: delete `surveillance.db` and restart — it reseeds from CSV.

## Suspicious clusters in the data

| Cluster | Trader | Instrument | Pattern |
|---------|--------|------------|---------|
| A | T-1042 | HDFCBANK | LAYERING — 14 orders, 12 cancelled 420–780ms, 2 sells at elevated price |
| B | T-2891 | RELIANCE | SPOOFING — 8×80K orders cancelled 180–490ms, sell at 2912 |
| C | T-3301 | INFY | WASH TRADING — BUY A-3301 / SELL A-3302, 18s apart |

## API Endpoints Quick Reference

| Endpoint | Method | What it does |
|----------|--------|--------------|
| `/api/health` | GET | Status + trade count |
| `/api/trades` | GET | Paginated trades (`?page&limit&trader_id&instrument&status`) |
| `/api/alerts` | GET | All alerts with triage joined (`?pattern_type&severity&status&search`) |
| `/api/alert/<id>/full` | GET | Single alert + triage + escalations + trades |
| `/api/replay/start` | POST | Run all detectors, store alerts |
| `/api/refresh-data` | POST | Generate new trades at live prices |
| `/api/triage/<id>` | POST | AI triage + escalation workflow |
| `/api/triage/<id>` | GET | Fetch existing triage result |
| `/api/escalations` | GET | Escalation log (`?page&limit`) |
| `/api/stats` | GET | Dashboard counts (trades, alerts, escalated, dismissed, pending) |
| `/api/market-prices` | GET | Live NSE prices from yfinance |
| `/api/token-stats` | GET | Total calls, tokens, cost, avg time |
| `/api/trader/<id>` | GET | Trader profile + all their alerts |
| `/api/export/case/<alert_id>` | GET | Download compliance case JSON |
| `/api/subscribe` | POST | Subscribe email to alerts |
| `/api/subscribers/count` | GET | Subscriber count |
| `/api/ping` | GET | Keep-alive for Render free tier |

## Claude AI Triage — How It Works

**System prompt persona**: Chief Compliance Officer at NSE, 20 years experience, expert witness in SEBI proceedings.

**Token optimization**: Instead of sending 415 raw trades (~15,000 tokens), the system pre-computes:
- `cancel_ratio` (float)
- `sigma` (float)
- `evidence_summary` (1 sentence)
- Pattern metadata

**Result**: ~280 tokens input → **97% token savings** vs naive approach.

**Response fields** (all stored in `triage_results` table):
```json
{
  "verdict": "ESCALATE | DISMISS",
  "confidence": 91,
  "false_positive_probability": 9,
  "risk_level": "CRITICAL | HIGH | MEDIUM | LOW",
  "rationale": "...",
  "simple_explanation": "...",
  "recommended_action": "...",
  "regulatory_reference": "SEBI PFUTP Regulations 2003, Regulation 4(2)(a)"
}
```

## Pending / What Still Needs Doing

- [ ] Full demo rehearsal — run through: start replay → triage all → show escalation cards
- [ ] Deploy to Render (backend) + Render Static or Vercel (frontend)
- [ ] After deploy: update `API_BASE` fallback URL in `frontend/js/api.js` to production URL
- [ ] Verify Slack webhook fires correctly on fresh deploy
- [ ] Optional: add more trades variety for richer demo data

## Known Issues / Notes

- Frontend MUST be served via HTTP (not file://). Use `python -m http.server 3000`.
- Babel standalone fetches external scripts asynchronously but executes in DOM order — load order in `index.html` is critical.
- `surveillance.db` is gitignored — fresh clone requires running `python app.py` once to seed.
- Light mode uses navy `#1e3a8a` instead of gold as primary accent for readability.
- The `cases/` directory is gitignored — case JSON files are generated at runtime.

## Deploy to Render

1. Push repo to GitHub
2. Render dashboard → New → Blueprint → connect repo
3. Set env vars: `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL`, `EMAIL_SENDER`, `EMAIL_PASSWORD`
4. After backend deploy: update `API_BASE` in `frontend/js/api.js` to your Render URL
5. Deploy frontend as Render Static Site (root: `frontend/`, publish dir: `frontend/`)

## Context Window Note

Claude API calls are kept short and focused (max_tokens=600). The prompt sends pre-computed statistics, not raw trade rows. Each call costs ~$0.00014 and takes ~2.5s.
