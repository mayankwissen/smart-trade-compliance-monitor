# Trade Surveillance & Alert Triage Engine
Wissen Technology Hackathon 2026

An AI-powered real-time trade surveillance system that ingests NSE trade data, detects manipulation patterns (layering, spoofing, wash trading), and uses Claude Sonnet to autonomously triage alerts into ESCALATE/DISMISS verdicts with structured compliance workflows. The engine achieves end-to-end automation from raw trade data to compliance case creation, Slack notification, and 72-hour watchlist monitoring in a single API call.

## Architecture

```
CSV Data → [Ingestor] → [Detector] → [Triage/Claude API] → [Workflows]
     ↓            ↓           ↓              ↓                  ↓
  SQLite      Alerts DB   Pattern DB    Verdicts DB        Cases/Slack
```

**Components:**
- `ingestor.py` — Loads trades from SQLite, provides windowed queries per trader+instrument
- `detector.py` — Three detectors: layering (cancel ratio + sell elevation), spoofing (large rapid cancels), wash trading (cross-account self-dealing)
- `triage.py` — Calls Claude Sonnet with structured evidence, parses JSON verdict
- `workflows.py` — Creates JSON case files, sends Slack blocks, flags watchlist
- `app.py` — Flask REST API with CORS, pagination, replay endpoint
- `database.py` — SQLite schema init + CSV seed on first boot

## Setup — Local

```bash
# 1. Clone and enter project
cd trade-surveillance/backend

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp ../.env.example .env
# Edit .env and set ANTHROPIC_API_KEY

# 4. Start server
python app.py
# Server starts at http://localhost:5000

# 5. Open frontend
# Open frontend/index.html directly in browser (no build step needed)
```

## Setup — Render Deployment

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. Add environment variables in Render dashboard:
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `SLACK_WEBHOOK_URL` — optional Slack webhook
5. Deploy — build takes ~2 minutes on free tier
6. Update `API` constant in `frontend/index.html` to your Render URL

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health + trade count |
| GET | `/api/trades?page=1&limit=50` | Paginated trade list |
| GET | `/api/alerts` | All alerts with triage results joined |
| POST | `/api/replay/start` | Scan all trades, detect patterns, store alerts |
| POST | `/api/triage/<alert_id>` | AI triage + escalation workflow |
| GET | `/api/triage/<alert_id>` | Fetch existing triage result |
| GET | `/api/escalations` | Last 50 escalation log entries |
| GET | `/api/stats` | Dashboard statistics |

## Demo Walkthrough

1. **Open** `frontend/index.html` in browser — stats bar shows 300 trades loaded
2. **Click ▶ START REPLAY** — backend scans all 300 trades, detects 3 suspicious clusters
3. **Watch** Alert Feed populate with LAYERING (T-1042/HDFCBANK), SPOOFING (T-2891/RELIANCE), WASH_TRADING (T-3301/INFY)
4. **Click** any alert row to open Triage Detail panel on the right
5. **Click "TRIAGE →"** on an alert — Claude Sonnet analyzes evidence in ~2s
6. **See** verdict (ESCALATE/DISMISS), confidence bar, and AI rationale appear
7. **Watch** Escalation Log at bottom: CASE_CREATED, SLACK_NOTIFIED, WATCHLIST_FLAGGED
8. **Click "AUTO-TRIAGE ALL"** to process all pending alerts in one batch
9. **Check `cases/`** directory for generated COMP-XXXX.json compliance case files

## Token Efficiency

The triage prompt is intentionally compact: evidence is pre-computed by deterministic detectors (cancel ratio, sigma, median cancel time) and pa
ssed as structured key-value p
airs rather than raw trade rows. This reduces token usage by ~95% versus sending full trade histories to the LLM. Claude receives exactly what it needs to render a verdict — pattern type, severity, quantitative stats, and a single evidence sentence. `max_tokens=300` caps response cost. The system prompt is minimal (2 sentences) to avoid prompt caching overhead on short calls.
