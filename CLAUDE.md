# Trade Surveillance & Alert Triage Engine

## What this project is
AI-powered NSE trade surveillance system. Ingests trade data, detects manipulation patterns
(layering, spoofing, wash trading), and uses Claude Sonnet to triage alerts into
ESCALATE/DISMISS verdicts with full compliance workflows.

Built for Wissen Technology Hackathon 2026.

## Model in use
- **Triage AI**: `claude-sonnet-4-6` (hardcoded in `backend/triage.py`)
- **Claude Code session**: Sonnet 4.6 (default) — change with `/model` in the CLI

## Current Status — as of 2026-06-06
- **Backend**: Flask + SQLite, 22 endpoints, all working, no Pylance errors
- **Frontend**: Multi-file React 18, 7 pages, gold/black Bloomberg theme, fully restructured
- **Triage**: Claude Sonnet CCO persona, 8-field SEBI-quality JSON, model: claude-sonnet-4-6
- **Layout**: Fixed sidebar + header, per-page scrolling, works at 100% zoom
- **Refresh button**: One click does refresh-data → replay/start → updates state (no reload)
- **Demo Mode button**: Full auto-demo in one click (refresh → detect → triage first HIGH alert)
- **Reset Demo button**: Fresh trades + wipe alerts/triage/escalations
- **Timestamps**: Dynamic — always uses last 3 real trading days (Mon–Fri)
- **4 patterns**: LAYERING, SPOOFING, WASH_TRADING, PUMP_AND_DUMP (T-4401/TCS)
- **Token usage bar**: Live AI usage shown in Dashboard (calls, tokens, cost)
- **CORS**: Explicit origins for Render frontend + localhost
- **Deployment**: Backend on Render, frontend on Render Static
- **STR Generator**: /api/generate-str/:id returns print-ready FIU-IND filing HTML
- **Trade Timeline**: 4th tab in AlertDetail — Chart.js bar chart of order flow
- **Trader Profile**: /trader/:id page — risk score, pattern breakdown, alert history
- **Market Impact**: /api/market-impact/:id — price movement + financial harm estimate
- **Alert Correlation**: Dashboard panel groups alerts within 10-minute windows

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

> Frontend uses `type="text/babel" src="..."` for external scripts.
> Opening index.html directly (file://) will NOT work.

## Completed Features

| Feature | Status |
|---------|--------|
| ~407 synthetic trades with real NSE prices (yfinance) | ✅ |
| Dynamic timestamps — last 3 real trading days | ✅ |
| 4 pattern detectors: LAYERING, SPOOFING, WASH_TRADING, PUMP_AND_DUMP | ✅ |
| Claude Sonnet triage — 8-field SEBI-quality verdict | ✅ |
| Slack notifications on ESCALATE | ✅ |
| Email notifications to subscribers | ✅ |
| Compliance case file creation (COMP-XXXX.json) | ✅ |
| 72-hour watchlist flagging | ✅ |
| Refresh Live Data → auto-detects patterns in one click | ✅ |
| Demo Mode button → full auto-demo (refresh+detect+triage) | ✅ |
| Reset Demo button → fresh trades + clear alerts | ✅ |
| Token usage bar on Dashboard (calls, tokens, cost) | ✅ |
| Multi-page hash routing: #/ #/alerts #/alert/:id #/trades #/logs #/settings | ✅ |
| Gold/black Bloomberg terminal theme | ✅ |
| Dark/light toggle (localStorage) | ✅ |
| Chart.js: donut (patterns) + bar (severity) | ✅ |
| Top Suspects leaderboard | ✅ |
| NSE price panel — 20 stocks, vertical scroll, search filter, ▲/▼ change%, last-updated | ✅ |
| Token usage stats endpoint | ✅ |
| Case Report — print-ready HTML (not raw JSON) — for judges + compliance officers | ✅ |
| Fixed layout at 100% zoom (position:fixed sidebar + header) | ✅ |
| Health checks auto-refresh every 30s (Settings page) | ✅ |
| Render Static Site — serves index.html (landing) + app.html (dashboard) directly | ✅ |
| No Pylance errors in any backend file | ✅ |
| STR Auto-Generator — print-ready FIU-IND filing from triage data | ✅ |
| Trade Timeline Chart — Chart.js bar chart (BUY/SELL/CANCELLED) on AlertDetail | ✅ |
| Trader Risk Profile page — risk score 0–100, pattern breakdown, alert history | ✅ |
| Market Impact endpoint — price move %, financial harm estimate | ✅ |
| Alert Correlation Panel — Dashboard groups alerts within 10-min windows | ✅ |
| Trader ID in AlertDetail is clickable → Trader Profile page | ✅ |
| detector.py PUMP_AND_DUMP datetime.utcnow() replaced with _now_iso() | ✅ |

## File Structure

```
trade-surveillance/
├── backend/
│   ├── app.py              # Flask REST API — 22 endpoints
│   ├── triage.py           # Claude API call, CCO persona, 8-field JSON, real token tracking
│   ├── detector.py         # 4 pattern detectors (LAYERING, SPOOFING, WASH, PUMP_AND_DUMP)
│   ├── database.py         # SQLite init + CSV seed + migration (input/output_tokens cols)
│   ├── ingestor.py         # Trade loader, windowed queries
│   ├── workflows.py        # Case creation, Slack, watchlist
│   ├── market_data.py      # yfinance live NSE prices + dynamic trade generation (20 stocks)
│   ├── emailer.py          # Email via SendGrid HTTP API (port 443 — SMTP blocked on Render)
│   ├── Procfile            # gunicorn for Render
│   ├── requirements.txt    # anthropic>=0.40.0, flask, yfinance, gunicorn
│   └── data/
│       └── trades_sample.csv   # 415 seed rows, 4 injected suspicious clusters
├── frontend/
│   ├── index.html          # Landing page (entry point) — Bloomberg-themed marketing site
│   ├── app.html            # React dashboard — loads CSS + 18 JS files via Babel
│   ├── css/
│   │   └── styles.css      # Fixed layout, gold scrollbar, responsive grid
│   └── js/
│       ├── api.js          # API_BASE (auto-switches local/prod), DARK/LIGHT themes
│       ├── app.js          # Root App, ReactDOM.createRoot, hash routing (7 pages)
│       ├── components/
│       │   ├── Header.js       # Fixed header + PricePanel (20 stocks, auto-scroll)
│       │   ├── Sidebar.js      # Fixed sidebar, SVG icons, 5 nav items
│       │   ├── Shared.js       # ThemeCtx, useRoute (/trader/:id support), Card, Btn, Bdg
│       │   ├── StatsBar.js     # 5-card stats grid
│       │   ├── Charts.js       # Chart.js donut + bar
│       │   └── TopSuspects.js  # Ranked trader leaderboard
│       └── pages/
│           ├── Dashboard.js    # Alert feed, token bar, correlated activity panel
│           ├── Alerts.js       # Full alert table, filters, auto-triage all
│           ├── AlertDetail.js  # 4 tabs: AI Triage, Evidence, Escalations, Timeline chart
│           ├── TraderProfile.js # Risk score 0-100, pattern breakdown, alert history
│           ├── Trades.js       # 407 trades, 5 filters, flagged trader highlighting
│           ├── Logs.js         # Escalation log, CSV export, 5s auto-refresh
│           └── Settings.js     # Architecture diagram, health checks, API usage stats
├── cases/                  # Generated COMP-XXXX.json compliance case files
├── ARCHITECTURE.md         # Full system architecture for judges
├── CLAUDE.md               # This file — dev notes
├── README.md               # User-facing setup + demo guide
├── render.yaml             # Render blueprint auto-deploy config
└── .env.example            # ANTHROPIC_API_KEY, SLACK_WEBHOOK_URL, etc.
```

## Key Commands

```bash
# Start backend
cd backend && python app.py

# Start frontend
cd frontend && python -m http.server 3000

# Install dependencies
cd backend && pip install -r requirements.txt

# Reset database
del backend\surveillance.db && python backend\app.py

# Test backend
curl http://localhost:5000/api/health
curl -X POST http://localhost:5000/api/refresh-data
curl -X POST http://localhost:5000/api/replay/start

# Commit and push
git add -A && git commit -m "message" && git push
```

## Environment Variables (backend/.env)

```
ANTHROPIC_API_KEY=sk-ant-...       # Required — Claude triage
SLACK_WEBHOOK_URL=https://...      # Optional — Slack notifications
EMAIL_SENDER=you@gmail.com         # Optional — verified sender address for SendGrid
SENDGRID_API_KEY=SG.xxx...         # Optional — SendGrid HTTP API (replaces SMTP, works on Render)
PORT=5000                          # Optional — defaults to 5000
```

## Database

SQLite at `backend/surveillance.db` (auto-created on first run).
5 tables: `trades`, `alerts`, `triage_results`, `escalations`, `subscribers`.
To reset: delete `surveillance.db` and restart (reseeds from CSV automatically).

## Suspicious Clusters

| Cluster | Trader | Instrument | Pattern |
|---------|--------|------------|---------|
| A | T-1042 | HDFCBANK | LAYERING — 14 orders, 12 cancelled 420–780ms |
| B | T-2891 | RELIANCE | SPOOFING — 8×80K orders cancelled 180–490ms |
| C | T-3301 | INFY | WASH TRADING — BUY A-3301 / SELL A-3302, 18s |
| D | T-4401 | TCS | PUMP_AND_DUMP — 5×22K BUY in 14min, 2×55K SELL in next 4min |

## API Endpoints Quick Reference

| Endpoint | Method | What it does |
|----------|--------|--------------|
| `/api/health` | GET | Status + trade count |
| `/api/trades` | GET | Paginated trades (filters: trader_id, instrument, status) |
| `/api/alerts` | GET | Alerts with triage joined (filters: pattern, severity, status) |
| `/api/alert/<id>/full` | GET | Single alert + triage + escalations + trades |
| `/api/refresh-data` | POST | Wipe all 4 tables + generate fresh trades at live prices |
| `/api/replay/start` | POST | Run all 4 detectors, store alerts |
| `/api/triage/<id>` | POST | AI triage + escalation workflow |
| `/api/triage/<id>` | GET | Fetch existing triage result |
| `/api/escalations` | GET | Escalation log |
| `/api/stats` | GET | Dashboard counts |
| `/api/market-prices` | GET | Live NSE prices from yfinance |
| `/api/token-stats` | GET | Total calls, real tokens, cost, avg time |
| `/api/export/case/<id>` | GET | Print-ready HTML compliance case report (open in browser, save as PDF) |
| `/api/generate-str/<id>` | GET | Print-ready FIU-IND STR filing HTML |
| `/api/trader/<id>` | GET | Trader risk profile (score, alerts, patterns) |
| `/api/market-impact/<id>` | GET | Price movement + financial harm estimate |
| `/api/correlated-alerts` | GET | Alerts grouped by 10-minute windows |
| `/api/subscribe` | POST | Subscribe email to alerts |
| `/api/reset` | POST | Delete alerts + triage + escalations (keep trades) |
| `/api/ping` | GET | Keep-alive for Render free tier |

## Claude AI Triage

**Persona**: Chief Compliance Officer at NSE, 20 years experience, SEBI expert witness.

**Token optimization**: Pre-computed stats sent (~280 tokens) vs raw trade rows (~15,000 tokens).
**Result**: 97% token reduction. ~$0.00014/call. ~2.5s avg processing time.

**Response fields**:
```json
{
  "verdict": "ESCALATE | DISMISS",
  "confidence": 91,
  "false_positive_probability": 9,
  "risk_level": "CRITICAL | HIGH | MEDIUM | LOW",
  "rationale": "4-5 sentences citing specific numbers",
  "simple_explanation": "1-2 sentences for board members",
  "recommended_action": "Specific: freeze account / file STR / audit log",
  "regulatory_reference": "SEBI PFUTP Regulations 2003, Regulation 4(2)(a)"
}
```

## QA Fixes Applied (2026-06-06)

| Fix | Status |
|-----|--------|
| `regulatory_reference` fallback — never NULL, per-pattern SEBI defaults | ✅ |
| Real token tracking — `response.usage.input_tokens/output_tokens` saved to DB | ✅ |
| `input_tokens` + `output_tokens` columns added to `triage_results` (migration) | ✅ |
| `/api/token-stats` sums real tokens from DB, correct pricing ($3/$15 per Mtok) | ✅ |
| 20 stocks in `market_data.py` — PUMP_AND_DUMP triggers locally too | ✅ |
| `.env.example` updated — SENDGRID_API_KEY replaces EMAIL_PASSWORD (SMTP blocked on Render) | ✅ |
| `backend/.env` confirmed not tracked by git (gitignored) | ✅ |
| `detector.py` — `datetime.utcnow()` replaced with `datetime.now(timezone.utc)` | ✅ |
| `/api/health` always returns `"model":"claude-sonnet-4-6"` (hardcoded) | ✅ |

## Known Issues / Notes

- Frontend MUST be served via HTTP (not file://). Use `python -m http.server 3000`.
- Babel standalone fetches external scripts — load order in `index.html` is critical.
- `surveillance.db` is gitignored — fresh clone needs `python app.py` once to seed.
- `cases/` directory is gitignored — case files generated at runtime.
- Free tier Render spins down after 15 min idle — `/api/ping` exists for keep-alive.
- All `datetime.utcnow()` calls replaced with `_now_iso()` across detector.py.

## Pre-Demo Checklist (run after every Render redeploy)

Render wipes SQLite on every deploy. Before judges see the app, always run:
1. Click **Reset Demo** (or POST `/api/reset`)
2. Click **Refresh Live Data** (or POST `/api/refresh-data`)
3. POST `/api/replay/start` — creates the 4 alerts
4. Triage all 4 alerts (or click **Demo Mode** — does all 3 steps automatically)

## Production Status — as of 2026-06-06

- [x] Frontend deployed → https://smart-trade-compliance-monitor-1.onrender.com
- [x] Backend deployed → https://smart-trade-compliance-monitor.onrender.com
- [x] ANTHROPIC_API_KEY set in Render env vars
- [x] Slack webhook configured
- [x] All 22 endpoints verified working
- [x] Case Report returns HTML (not JSON) — print/PDF ready for judges
- [ ] Full demo rehearsal with fresh Render deploy before judging
