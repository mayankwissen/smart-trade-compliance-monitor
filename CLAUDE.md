# Trade Surveillance & Alert Triage Engine

## What this project is
AI-powered NSE trade surveillance system. Ingests trade data, detects manipulation patterns
(layering, spoofing, wash trading), and uses Claude Sonnet to triage alerts into
ESCALATE/DISMISS verdicts with full compliance workflows.

Built for Wissen Technology Hackathon 2026.

## Model in use
- **Triage AI**: `claude-sonnet-4-5` (hardcoded in `backend/triage.py`)
- **Claude Code session**: Sonnet 4.6 (default) — change with `/model` in the CLI

## Current Status — as of 2026-06-06
- **Backend**: Flask + SQLite, 20 endpoints, all working, no Pylance errors
- **Frontend**: Multi-file React 18, 6 pages, gold/black Bloomberg theme, fully restructured
- **Triage**: Claude Sonnet CCO persona, 8-field SEBI-quality JSON, model: claude-sonnet-4-5
- **Layout**: Fixed sidebar + header, per-page scrolling, works at 100% zoom
- **Refresh button**: One click does refresh-data → replay/start → updates state (no reload)
- **Demo Mode button**: Full auto-demo in one click (refresh → detect → triage first HIGH alert)
- **Reset Demo button**: Fresh trades + wipe alerts/triage/escalations
- **Timestamps**: Dynamic — always uses last 3 real trading days (Mon–Fri)
- **4 patterns**: LAYERING, SPOOFING, WASH_TRADING, PUMP_AND_DUMP (T-4401/TCS)
- **Token usage bar**: Live AI usage shown in Dashboard (calls, tokens, cost)
- **CORS**: Explicit origins for Render frontend + localhost
- **Deployment**: Backend on Render, frontend on Render Static

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
| Live NSE price ticker (auto-refreshes 60s) | ✅ |
| Token usage stats endpoint | ✅ |
| Export case JSON endpoint | ✅ |
| Fixed layout at 100% zoom (position:fixed sidebar + header) | ✅ |
| Health checks auto-refresh every 30s (Settings page) | ✅ |
| vercel.json for SPA hash routing | ✅ |
| No Pylance errors in any backend file | ✅ |

## File Structure

```
trade-surveillance/
├── backend/
│   ├── app.py              # Flask REST API — 18 endpoints
│   ├── triage.py           # Claude API call, CCO persona, 8-field JSON
│   ├── detector.py         # 3 pattern detectors
│   ├── database.py         # SQLite init + CSV seed
│   ├── ingestor.py         # Trade loader, windowed queries
│   ├── workflows.py        # Case creation, Slack, watchlist
│   ├── market_data.py      # yfinance live NSE prices + dynamic trade generation
│   ├── emailer.py          # SMTP email notifications
│   ├── Procfile            # gunicorn for Render
│   ├── requirements.txt    # anthropic>=0.40.0, flask, yfinance, gunicorn
│   └── data/
│       └── trades_sample.csv   # 415 seed rows, 3 injected suspicious clusters
├── frontend/
│   ├── index.html          # Thin loader — loads CSS + 17 JS files via Babel
│   ├── vercel.json         # SPA rewrite: all routes → index.html
│   ├── css/
│   │   └── styles.css      # Fixed layout, gold scrollbar, responsive grid
│   └── js/
│       ├── api.js          # API_BASE (auto-switches local/prod), DARK/LIGHT themes
│       ├── app.js          # Root App, ReactDOM.createRoot, fetchAll passed to Dashboard
│       ├── components/
│       │   ├── Header.js       # Fixed header, price ticker, subscribe, replay button
│       │   ├── Sidebar.js      # Fixed sidebar, 5 nav items
│       │   ├── StatsBar.js     # 5-card stats grid (32px numbers)
│       │   ├── Charts.js       # Chart.js donut + bar
│       │   └── TopSuspects.js  # Ranked trader leaderboard
│       └── pages/
│           ├── Dashboard.js    # Alert feed (paginated), refresh+detect chain, escalations
│           ├── Alerts.js       # Full alert table, filters, auto-triage all
│           ├── AlertDetail.js  # Verdict, narrative, 4 info boxes, AI metrics, escalation
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
EMAIL_SENDER=you@gmail.com         # Optional — email notifications
EMAIL_PASSWORD=app-password        # Optional — Gmail app password
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
| `/api/replay/start` | POST | Run all detectors, store alerts |
| `/api/triage/<id>` | POST | AI triage + escalation workflow |
| `/api/triage/<id>` | GET | Fetch existing triage result |
| `/api/escalations` | GET | Escalation log |
| `/api/stats` | GET | Dashboard counts |
| `/api/market-prices` | GET | Live NSE prices from yfinance |
| `/api/token-stats` | GET | Total calls, tokens, cost, avg time |
| `/api/export/case/<id>` | GET | Download compliance case JSON |
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

## Known Issues / Notes

- Frontend MUST be served via HTTP (not file://). Use `python -m http.server 3000`.
- Babel standalone fetches external scripts — load order in `index.html` is critical.
- `surveillance.db` is gitignored — fresh clone needs `python app.py` once to seed.
- `cases/` directory is gitignored — case files generated at runtime.
- Free tier Render spins down after 15 min idle — `/api/ping` exists for keep-alive.
- `detector.py` still uses `datetime.utcnow()` — minor deprecation, does not affect runtime.

## Pending

- [ ] Deploy frontend to Vercel/Render Static
- [ ] Update API_BASE in frontend/js/api.js if Render URL changes
- [ ] Full demo rehearsal before judging
- [ ] Verify Slack webhook fires on fresh deploy
