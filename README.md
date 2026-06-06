# Trade Surveillance & Alert Triage Engine
**Wissen Technology Hackathon 2026 | Mayank Gupta**

> **10 seconds.** That's how long it takes to go from a suspicious trade pattern to a
> SEBI-ready compliance case, Slack notification, email alert, and 72-hour watchlist flag —
> fully automated, with AI reasoning that cites the exact SEBI regulation number.

---

## The Problem

NSE processes millions of trades daily. Compliance officers manually review 50–200 flagged
alerts per day — each taking 15–30 minutes. The process is slow, inconsistent, and relies
on individual expertise that walks out the door when an analyst leaves.

## The Solution

An end-to-end AI compliance pipeline that:
1. **Detects** market manipulation patterns (layering, spoofing, wash trading) deterministically
2. **Triages** each alert using Claude Sonnet acting as an NSE Chief Compliance Officer
3. **Acts** automatically — opens compliance case, notifies Slack, emails the team, flags watchlist

The AI doesn't just say "suspicious" — it produces an 8-field SEBI-quality verdict with
confidence score, rationale citing specific trade statistics, plain-English explanation for
board members, recommended next steps, and the exact SEBI regulation violated.

---

## Live Demo

```
Backend:   https://smart-trade-compliance-monitor.onrender.com
Frontend:  Deploy frontend/ to Vercel or run locally (see Setup)
```

### One-Click Demo Flow

1. Open the dashboard → click **🔄 Refresh Live Data**
   - Fetches live NSE prices via yfinance
   - Generates ~407 trades with today's timestamps
   - Automatically detects 5 alerts (2 LAYERING, 2 SPOOFING, 1 WASH_TRADING)

2. Click any alert row → **⚡ Triage This Alert**
   - Claude Sonnet analyzes in ~2.5 seconds
   - Returns: verdict, confidence %, rationale, plain-English box, regulatory reference
   - If ESCALATE: creates case file, fires Slack, emails subscribers, flags watchlist

3. Click **AUTO-TRIAGE ALL** on Alerts page → all pending alerts triaged in sequence

4. Visit **Settings** → see live token consumption (~$0.00014/call, 460 tokens total)

---

## Architecture

```
yfinance (Live NSE) ──► market_data.py ──► SQLite DB ──► detector.py ──► alerts
                                                                │
                                                           triage.py
                                                      (Claude Sonnet CCO)
                                                                │
                                                         workflows.py
                                              ┌──────────────┼──────────────┐
                                         Case JSON      Slack Block     Email + Watchlist
```

Full architecture with component diagrams, data flow, and AI design rationale: **[ARCHITECTURE.md](ARCHITECTURE.md)**

---

## Key Technical Decisions

### Why 97% Fewer Tokens?

Naive approach: send all 14 trade rows to the LLM → ~15,000 tokens → $0.045/call

This system pre-computes what matters: `cancel_ratio`, `sigma`, `evidence_summary` →
sends ~280 tokens → **$0.00014/call**.

At 1,000 alerts/day: **$45/day vs $0.14/day**. Same quality verdict. 97% cheaper.

### Why a Persona, Not a Generic Prompt?

The system prompt makes Claude a specific person: NSE CCO, 20 years experience, expert
witness in SEBI proceedings. This forces domain-specific reasoning — regulatory citations,
financial vocabulary, defensible escalation logic — instead of generic "this seems risky."

### Why Structured Output?

All 8 fields are required JSON. No prose. This means every verdict is:
- Machine-readable (feeds into case management systems)
- Auditable (each field has a specific legal purpose)
- Consistent (no variation in format across 1,000 calls)

---

## Suspicious Clusters in the Data

Three injected patterns that always trigger detection:

| Cluster | Trader | Instrument | Pattern | Evidence |
|---------|--------|------------|---------|---------|
| A | T-1042 | HDFCBANK | LAYERING | 14 orders, 12 BUY cancelled in 420–780ms, 2 SELLs executed at +0.8% |
| B | T-2891 | RELIANCE | SPOOFING | 8×80,000-share orders cancelled in 180–490ms, sell at elevated price |
| C | T-3301 | INFY | WASH TRADING | BUY on A-3301, SELL on A-3302, same size, 18 seconds apart |

---

## Setup — Local

```bash
# Backend
cd trade-surveillance/backend
pip install -r requirements.txt
cp ../.env.example .env          # add ANTHROPIC_API_KEY
python app.py                    # → http://localhost:5000

# Frontend (MUST use HTTP server — Babel loads external JS files)
cd ../frontend
python -m http.server 3000       # → http://localhost:3000
```

> Do NOT open `index.html` directly (`file://`). The React app uses Babel Standalone
> with `type="text/babel" src="..."` which requires an HTTP server.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/refresh-data` | Wipe DB + generate fresh trades at live NSE prices |
| POST | `/api/replay/start` | Run all 3 detectors across all trade pairs |
| POST | `/api/triage/<id>` | AI triage + full escalation workflow |
| GET | `/api/alert/<id>/full` | Complete alert + triage + escalations + trades |
| GET | `/api/stats` | Dashboard counts |
| GET | `/api/alerts` | All alerts with triage joined (filterable) |
| GET | `/api/trades` | Paginated trades (filterable by trader/instrument/status) |
| GET | `/api/market-prices` | Live NSE prices from yfinance |
| GET | `/api/token-stats` | Claude usage — calls, tokens, estimated cost |
| GET | `/api/export/case/<id>` | Download compliance case JSON |
| POST | `/api/subscribe` | Subscribe email to alert notifications |
| GET | `/api/health` | Service health + trade count |

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...       # Required
SLACK_WEBHOOK_URL=https://...      # Optional — Slack notifications
EMAIL_SENDER=you@gmail.com         # Optional — email notifications
EMAIL_PASSWORD=app-password        # Optional — Gmail app password
```

---

## Deploy to Render

1. Push to GitHub
2. Render → New → Blueprint → connect repo (reads `render.yaml` automatically)
3. Set `ANTHROPIC_API_KEY` in Render env vars
4. Backend live at `https://your-service.onrender.com`
5. Deploy `frontend/` as Render Static Site or Vercel (uses `vercel.json` for SPA routing)

---

## Performance

| Metric | Value |
|--------|-------|
| Alert detection (407 trades) | < 1 second |
| AI triage per alert | ~2.5 seconds |
| Tokens per call | ~460 (280 input + 180 output) |
| Cost per call | ~$0.00014 |
| Token reduction vs naive | 97% |
| Full pipeline (refresh → detect → triage) | < 15 seconds |

---

## Tech Stack

- **AI**: Claude Sonnet (Anthropic) — CCO persona, SEBI domain expert
- **Backend**: Python 3.12, Flask, SQLite, gunicorn
- **Market Data**: yfinance (live NSE prices, no API key required)
- **Frontend**: React 18 via CDN, Babel Standalone, Chart.js
- **Notifications**: Slack Webhooks, SMTP email
- **Deployment**: Render (backend), Vercel (frontend)
