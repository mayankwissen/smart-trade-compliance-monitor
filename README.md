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
1. **Detects** 4 market manipulation patterns deterministically (layering, spoofing, wash trading, pump and dump)
2. **Triages** each alert using Claude Sonnet acting as an NSE Chief Compliance Officer
3. **Acts** automatically — opens compliance case, notifies Slack, emails the team, flags watchlist
4. **Explains** — generates FIU-IND ready STR filing, trade timeline visualization, trader risk profile
5. **Visualizes** — cartel network graph with pulsing suspicious nodes, freeze/animate, click-to-inspect
6. **Replays** — animated crime scene replay shows millisecond-by-millisecond manipulation sequence
7. **Verifies** — XAI Truth Anchors mathematically verify every Claude claim against raw DB data
8. **Speaks** — AI chat assistant with voice TTS toggle; reads responses aloud on demand
9. **Self-heals** — auto-raises a GitHub issue when the backend returns a 500 error (5-minute cooldown)

The AI doesn't just say "suspicious" — it produces an 8-field SEBI-quality verdict with
confidence score, rationale citing specific trade statistics, plain-English explanation for
board members, recommended next steps, and the exact SEBI regulation violated.

---

## Live Demo

```
Backend:   https://smart-trade-compliance-monitor.onrender.com
Frontend:  https://smart-trade-compliance-monitor-1.onrender.com
```

### One-Click Demo Flow

**Option A — Demo Mode (easiest for live demos)**
1. Click **Demo Mode** on the Dashboard
   - Automatically: fetches live prices → generates trades → detects alerts → triages first HIGH alert

**Option B — Manual**
1. Click **Refresh Live Data** → generates ~432 trades at live NSE prices + auto-detects up to 7 alerts
2. Click any alert row → **Triage This Alert** → Claude analyzes → SEBI-quality verdict
3. Watch the verdict: **ESCALATE** (genuine manipulation) triggers full workflow; **DISMISS** shows green
   "FALSE POSITIVE SUPPRESSED" badge — T-0501/T-0502/T-0503 are designed to DISMISS
4. On Alert Detail → **Timeline** tab → see Chart.js visualization of suspicious order flow
5. Click **Trader ID** in the overview → Trader Risk Profile (risk score, all history)
6. If verdict is ESCALATE → **Escalations** tab → **Generate STR Filing** → print-ready FIU-IND document
7. Click **Case Report (Print/PDF)** on any alert → human-readable HTML report judges can print or save as PDF

**Reset between demos**
- Click **Reset Demo** → wipes alerts/triage/escalations, generates fresh trade data

**Check AI usage**
- Token bar at top of Dashboard shows: triage calls · tokens used · estimated cost · model name
- Visit **Settings** for full health checks + API stats (auto-refresh every 30s)

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
                                                                │
                                                    Analysis Endpoints
                                          ┌───────────────────┼────────────────────┐
                                    STR Generator      Market Impact        Correlation
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

### Why a STR Generator?

NSE compliance officers spend 2–3 hours drafting Suspicious Transaction Reports manually.
The system generates a pre-filled, print-ready FIU-IND STR from the AI verdict in one click.
This alone reduces per-case time from hours to seconds.

### Why WAL Journal Mode?

SQLite defaults to DELETE journal mode, which requires an exclusive write lock — causing
`database is locked` errors under concurrent gunicorn threads. WAL (Write-Ahead Logging)
allows simultaneous reads and one writer. Reads never block. Set once in `init_db()`,
persists to the database file permanently.

---

## Suspicious Clusters in the Data

Four genuine patterns that always ESCALATE, plus three borderline traders that DISMISS:

| Cluster | Trader | Instrument | Pattern | Expected Verdict |
|---------|--------|------------|---------|-----------------|
| A | T-1042 | HDFCBANK | LAYERING | **ESCALATE** — 14 orders, 12 BUY cancelled in 420–780ms, sigma ≈ 8.2σ |
| B | T-2891 | RELIANCE | SPOOFING | **ESCALATE** — 8×80,000-share orders cancelled in 180–490ms, sigma ≈ 8.6σ |
| C | T-3301 | INFY | WASH TRADING | **ESCALATE** — BUY A-3301 / SELL A-3302, same size, 18 seconds apart |
| D | T-4401 | TCS | PUMP AND DUMP | **ESCALATE** — 5×22K shares in 14min, 2×55K sold in 4min, sigma 11.0σ |
| BL-1 | T-0501 | HDFCBANK | LAYERING (borderline) | **DISMISS** — 60% cancel ratio but cancels at 840–920ms (legitimate market maker) |
| BL-2 | T-0502 | WIPRO | LAYERING (borderline) | **DISMISS** — 62% cancel ratio, cancels at 790–1050ms (algo liquidity provision) |
| BL-3 | T-0503 | SBIN | LAYERING (borderline) | **DISMISS** — 57% cancel ratio, cancels at 920–1200ms (barely triggered, textbook FP) |

The borderline traders demonstrate that the AI correctly distinguishes slow-cancel market makers from rapid-cancel manipulators, even when the cancel ratio alone crosses the detection threshold.

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
| POST | `/api/replay/start` | Run all 4 detectors across all trade pairs |
| POST | `/api/reset` | Delete alerts + triage + escalations (keep trades) |
| POST | `/api/triage/<id>` | AI triage + full escalation workflow |
| GET | `/api/alert/<id>/full` | Complete alert + triage + escalations + trades |
| GET | `/api/alerts` | All alerts with triage joined (filterable) |
| GET | `/api/trades` | Paginated trades (filterable by trader/instrument/status) |
| GET | `/api/stats` | Dashboard counts |
| GET | `/api/market-prices` | Live NSE prices from yfinance |
| GET | `/api/token-stats` | Claude usage — calls, tokens, estimated cost |
| GET | `/api/export/case/<id>` | Print-ready HTML compliance case report (open in browser, save as PDF) |
| GET | `/api/generate-str/<id>` | Generate FIU-IND STR filing (print-ready HTML) |
| GET | `/api/trader/<trader_id>` | Trader risk profile — score, all alerts, pattern breakdown |
| GET | `/api/market-impact/<id>` | Price movement, financial harm estimate for an alert |
| GET | `/api/correlated-alerts` | Alerts grouped by 10-minute windows (coordinated manipulation) |
| POST | `/api/subscribe` | Subscribe email to alert notifications |
| GET | `/api/leaderboard` | Top suspects — traders ranked by alert count, criticality, risk score |
| POST | `/api/chat` | AI chat assistant — natural-language Q&A + full TECHNICAL_GUIDE knowledge base |
| GET | `/api/health` | Service health + trade count |
| GET | `/api/github/status` | GitHub auto-issue config — token status, repo, cooldown |
| POST | `/api/github/test-issue` | Fire a test GitHub issue immediately (bypasses 5-min cooldown) |

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...       # Required — Claude triage + AI chat
SLACK_WEBHOOK_URL=https://...      # Optional — Slack notifications
EMAIL_SENDER=you@gmail.com         # Optional — verified sender address for SendGrid
SENDGRID_API_KEY=SG.xxx...         # Optional — SendGrid HTTP API (SMTP blocked on Render)
GITHUB_TOKEN=ghp_xxx...            # Optional — auto-raise issues on backend 500 errors
ENVIRONMENT=production             # Required on Render — disables background agent thread
PORT=5000                          # Optional — defaults to 5000
```

---

## Keeping Render Awake (Free Tier)

Render free tier spins down after 15 minutes of inactivity, causing a 30–60 second cold start.
Two things prevent this:

**1. Auto-seed on startup (built in)**
The backend automatically runs `init_db()` + `seed_from_csv()` + pattern detection on every
process start. When Render wakes up, data is ready within seconds — no manual reset needed.

**2. UptimeRobot keep-alive (5-minute ping)**
1. Go to [uptimerobot.com](https://uptimerobot.com) → free account
2. New Monitor → HTTP(s) monitor
3. URL: `https://smart-trade-compliance-monitor.onrender.com/api/ping`
4. Interval: **5 minutes**
5. Save — Render will never spin down during the hackathon

**Check readiness before demo:**
```
GET https://smart-trade-compliance-monitor.onrender.com/api/warmup
→ { "status": "warm", "trades": 432, "alerts": 7, "ready": true }
```
If `ready` is `false`, hit `POST /api/replay/start` once.

---

## Deploy to Render

1. Push to GitHub
2. Render → New → Blueprint → connect repo (reads `render.yaml` automatically)
   - Creates **two services**: backend Python web service + frontend static site
3. Set `ANTHROPIC_API_KEY` (required) and `GITHUB_TOKEN` (optional) in Render env vars
4. Backend live at `https://your-service.onrender.com`
5. Frontend served as Render Static Site with `no-cache` headers on all JS/CSS/HTML

---

## Performance

| Metric | Value |
|--------|-------|
| Alert detection (~432 trades) | < 1 second |
| AI triage per alert | ~2.5 seconds |
| Tokens per call | ~460 (280 input + 180 output) |
| Cost per call | ~$0.00014 |
| Token reduction vs naive | 97% |
| Full pipeline (refresh → detect → triage) | < 15 seconds |
| API endpoints | 26 |
| Frontend pages | 8 (Dashboard, Alerts, Alert Detail, Trader Profile, Trades, Network Graph, Logs, Settings) |

---

## Tech Stack

- **AI**: Claude Sonnet (`claude-sonnet-4-6`) — CCO persona, SEBI domain expert + judge Q&A knowledge base
- **Backend**: Python 3.12, Flask, SQLite (WAL mode), gunicorn
- **Market Data**: yfinance (live NSE prices, no API key required)
- **Frontend**: React 18 via CDN, Babel Standalone, Chart.js 4.4, vis.js (network graph)
- **Notifications**: Slack Webhooks, SendGrid email, GitHub Issues (auto-raise on 500)
- **Voice**: Web Speech API — TTS for AI chat responses (toggle on/off per message)
- **Voice Commands**: Web Speech API — 16 navigation + action commands (Chrome/Edge)
- **AI Chat**: Claude Sonnet-powered assistant with full TECHNICAL_GUIDE knowledge base
- **Deployment**: Render (backend Python web service + frontend static site via `render.yaml`)

---

## Documentation

| File | Contents |
|------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full system design, data flow, component diagrams |
| [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) | 18-section deep-dive: math formulas, all patterns, XAI, judge Q&A, demo flow |
| [CLAUDE.md](CLAUDE.md) | Development context, feature changelog, production status |
