# Trade Surveillance & Alert Triage Engine

## What this project is
AI-powered NSE trade surveillance system. Ingests trade data, detects manipulation patterns (layering, spoofing, wash trading), and uses Claude Sonnet to triage alerts into ESCALATE/DISMISS verdicts with full compliance workflows.

Built for Wissen Technology Hackathon 2026.

## Model in use
- **Triage AI**: `claude-sonnet-4-20250514` (hardcoded in `backend/triage.py`)
- **Claude Code session**: Sonnet 4.6 (default) — change with `/model` in the CLI

## How to run locally

```bash
# Terminal 1 — start backend
cd trade-surveillance/backend
python app.py
# Runs at http://localhost:5000

# Frontend — no server needed
# Just open trade-surveillance/frontend/index.html in any browser
```

## Key commands

```bash
# Install dependencies
cd backend && pip install -r requirements.txt

# Verify import
python -c "from app import app; print('OK')"

# Test health
curl http://localhost:5000/api/health

# Trigger pattern detection
curl -X POST http://localhost:5000/api/replay/start

# Triage a specific alert (replace ID)
curl -X POST http://localhost:5000/api/triage/ALT-XXXXXXXX

# View all alerts
curl http://localhost:5000/api/alerts

# View stats
curl http://localhost:5000/api/stats
```

## Environment variables (backend/.env)
```
ANTHROPIC_API_KEY=sk-ant-...       # Required — used in triage.py
SLACK_WEBHOOK_URL=https://...      # Optional — Slack notifications
PORT=5000                          # Optional — defaults to 5000
```
Copy from `.env.example`, fill in `ANTHROPIC_API_KEY`.

## Project structure
```
trade-surveillance/
├── backend/
│   ├── app.py          # Flask REST API, all routes
│   ├── database.py     # SQLite init + CSV seed
│   ├── ingestor.py     # Trade loader, windowed queries
│   ├── detector.py     # 3 pattern detectors (layering/spoofing/wash)
│   ├── triage.py       # Claude API call + DB write
│   ├── workflows.py    # Case creation, Slack, watchlist
│   ├── data/
│   │   └── trades_sample.csv   # 325 rows, 3 injected suspicious clusters
│   └── requirements.txt
├── frontend/
│   └── index.html      # React 18 via CDN, single file, no build step
├── cases/              # Generated COMP-XXXX.json compliance case files
├── CLAUDE.md           # This file
├── .env.example
├── render.yaml         # One-click Render deploy config
└── README.md
```

## Database
SQLite at `backend/surveillance.db` (auto-created on first run).
4 tables: `trades`, `alerts`, `triage_results`, `escalations`.
To reset: delete `surveillance.db` and restart — it reseeds from CSV.

## Suspicious clusters in the data
| Cluster | Trader | Instrument | Pattern |
|---------|--------|------------|---------|
| A | T-1042 | HDFCBANK | LAYERING — 14 orders, 12 cancelled 420–780ms, 2 sells at 1641 |
| B | T-2891 | RELIANCE | SPOOFING — 8×80K orders cancelled 180–490ms, sell at 2912 |
| C | T-3301 | INFY | WASH TRADING — BUY A-3301 / SELL A-3302, 18s apart |

## API endpoints quick ref
| Endpoint | Method | What it does |
|----------|--------|--------------|
| `/api/health` | GET | Status + trade count |
| `/api/trades` | GET | Paginated trades (`?page=1&limit=50`) |
| `/api/alerts` | GET | All alerts with triage joined |
| `/api/replay/start` | POST | Run all detectors, store alerts |
| `/api/triage/<id>` | POST | AI triage + escalation workflow |
| `/api/triage/<id>` | GET | Fetch existing triage result |
| `/api/escalations` | GET | Last 50 escalation log entries |
| `/api/stats` | GET | Dashboard counts |

## Deploy to Render
1. Push repo to GitHub
2. Render dashboard → New → Blueprint → connect repo
3. Set `ANTHROPIC_API_KEY` env var in Render dashboard
4. After deploy, update `API` constant in `frontend/index.html` to your Render URL

## Context window note
This project makes short, focused Claude API calls (max_tokens=300). If you increase `max_tokens` in `triage.py`, responses get more verbose but cost more. The prompt is already pre-computed — sending raw trade rows instead of summarized evidence would waste ~95% of tokens.
