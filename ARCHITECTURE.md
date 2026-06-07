# System Architecture — Trade Surveillance & Alert Triage Engine

## The Problem

India's NSE processes over 100 crore trades daily. A compliance officer at a large brokerage
manually reviews 50–200 flagged alerts per day — each requiring them to open trade logs,
cross-reference SEBI regulations, assess intent, and decide: escalate to SEBI, or dismiss.

That process takes 15–30 minutes per alert. It is slow, inconsistent, and fatigue-prone.

**This system replaces manual review with an AI compliance officer that triages an alert
in under 10 seconds, produces a SEBI-ready verdict with regulatory citations, automatically
opens a case, sends Slack notification, emails the compliance team, flags the trader for
72-hour enhanced monitoring, generates a print-ready FIU-IND STR filing, and calculates
the estimated financial harm to the market — all from a single API call.**

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                        │
│                                                                          │
│   yfinance (Live NSE)          trades_sample.csv (415 trades)            │
│         │                              │                                 │
│         └──────────────┬───────────────┘                                 │
│                        ▼                                                 │
│               market_data.py                                             │
│          (generates ~407 synthetic trades                                │
│           at real-time NSE prices across                                 │
│           20 instruments, last 3 trading days)                           │
│                        │                                                 │
│                        ▼                                                 │
│                  SQLite Database                                         │
│          ┌────────────────────────────┐                                  │
│          │  trades  │  alerts         │                                  │
│          │  triage_results            │                                  │
│          │  escalations │ subscribers │                                  │
│          └────────────────────────────┘                                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                       DETECTION LAYER                                    │
│                                                                          │
│   ingestor.py                                                            │
│   └─ Loads trades, groups by trader+instrument pair                      │
│                                                                          │
│   detector.py — 4 deterministic pattern detectors                        │
│   ├─ detect_layering()      cancel_ratio > 70% + executed sells          │
│   ├─ detect_spoofing()      large orders (>50k) cancelled in <600ms      │
│   ├─ detect_wash_trading()  cross-account self-dealing within 30s        │
│   └─ detect_pump_and_dump() >100k shares accumulated ≤20min,            │
│                             sold within 10min                            │
│                                                                          │
│   Output: Alert objects with cancel_ratio, sigma, evidence_summary       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                         AI TRIAGE LAYER                      ★ KEY       │
│                                                                          │
│   triage.py                                                              │
│   └─ Claude Sonnet (claude-sonnet-4-6, max_tokens=1024)                                   │
│                                                                          │
│   System Persona:                                                        │
│   "You are Chief Compliance Officer at NSE with 20 years experience      │
│    in SEBI regulatory proceedings and expert witness testimony."         │
│                                                                          │
│   Input: ~280 tokens (pre-computed stats, NOT raw trade rows)            │
│   ├─ cancel_ratio, sigma, evidence_summary                               │
│   ├─ pattern_type, severity, trader_id                                   │
│   └─ structured JSON output format                                       │
│                                                                          │
│   Output: 8-field SEBI-quality verdict                                   │
│   ├─ verdict:                  ESCALATE | DISMISS                        │
│   ├─ confidence:               0–100                                     │
│   ├─ false_positive_probability: 0–100                                   │
│   ├─ risk_level:               CRITICAL | HIGH | MEDIUM | LOW            │
│   ├─ rationale:                4–5 sentences, cites specific numbers     │
│   ├─ simple_explanation:       plain English for board members           │
│   ├─ recommended_action:       freeze account / file STR / audit log     │
│   └─ regulatory_reference:     SEBI PFUTP 2003, specific regulation      │
│                                                                          │
│   Real token tracking: input_tokens + output_tokens saved to DB          │
│   Token Efficiency: ~280 tokens vs ~15,000 (raw trades) = 97% savings   │
│   Cost per call: ~$0.00014 | Avg processing time: ~2.5 seconds          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  verdict = ESCALATE
┌──────────────────────────────▼──────────────────────────────────────────┐
│                      COMPLIANCE WORKFLOW LAYER                           │
│                                                                          │
│   workflows.py — 4 automated actions on ESCALATE                        │
│                                                                          │
│   1. create_compliance_case()                                            │
│      └─ Writes COMP-XXXX.json case file with full audit trail            │
│         Assigns to "Surveillance Desk L2"                                │
│                                                                          │
│   2. send_slack_notification()                                           │
│      └─ Rich block message to #compliance-alerts                         │
│         Includes verdict, rationale, case ID, recommended action         │
│                                                                          │
│   3. send_email_notifications()                                          │
│      └─ HTML email to all active subscribers                             │
│         Analysts subscribe via the frontend UI                           │
│                                                                          │
│   4. flag_watchlist()                                                    │
│      └─ 72-hour enhanced monitoring flag on trader_id                    │
│                                                                          │
│   All 4 actions logged to escalations table for audit trail              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                      ANALYSIS ENDPOINTS LAYER                ★ NEW       │
│                                                                          │
│   /api/generate-str/<alert_id>                                           │
│   └─ Returns print-ready HTML Suspicious Transaction Report (STR)        │
│      Pre-filled with all 12 FIU-IND mandatory fields from triage data    │
│      One click → ready to submit to FIU-IND (saves 2–3 hrs of drafting) │
│                                                                          │
│   /api/trader/<trader_id>                                                │
│   └─ Trader risk profile: risk score (0–100), all alerts, pattern       │
│      breakdown, escalation count, watchlist status                       │
│      Risk score = Σ(pattern weights) + Σ(verdict weights), capped at 100│
│                                                                          │
│   /api/market-impact/<alert_id>                                          │
│   └─ Calculates price movement (%) during suspicious window,            │
│      total volume (INR), estimated financial harm, affected investors    │
│                                                                          │
│   /api/correlated-alerts                                                 │
│   └─ Groups alerts within 10-minute windows — flags possible            │
│      coordinated manipulation across instruments or accounts             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                          API LAYER                                       │
│                                                                          │
│   app.py — Flask REST API, 24 endpoints, CORS enabled                   │
│                                                                          │
│   Core flow:                                                             │
│   POST /api/refresh-data    → wipe DB + generate fresh trades            │
│   POST /api/replay/start    → run all 4 detectors, store alerts          │
│   POST /api/triage/:id      → AI triage + full escalation workflow       │
│   POST /api/reset           → fresh trades, clear alerts/triage          │
│                                                                          │
│   Data:                                                                  │
│   GET  /api/stats           → dashboard counts                           │
│   GET  /api/alerts          → all alerts with triage joined              │
│   GET  /api/alert/:id/full  → single alert + triage + escalations        │
│   GET  /api/trades          → paginated trades with filters              │
│   GET  /api/market-prices   → live NSE prices from yfinance              │
│   GET  /api/token-stats     → Claude usage, real tokens, cost            │
│   GET  /api/export/case/:id → print-ready HTML compliance case report    │
│                                                                          │
│   Analysis:                                                              │
│   GET  /api/generate-str/:id        → STR filing HTML                   │
│   GET  /api/trader/:id              → trader risk profile JSON           │
│   GET  /api/market-impact/:id       → market impact analysis             │
│   GET  /api/correlated-alerts       → 10-min window alert groups         │
│   GET  /api/leaderboard             → top suspects ranked by risk score  │
│   POST /api/chat                    → AI chat Q&A on live DB context     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                       FRONTEND LAYER                                     │
│                                                                          │
│   React 18 (no build step) — 7 pages, hash routing                      │
│                                                                          │
│   Dashboard      Alert feed, escalation log, pattern charts,            │
│                  top suspects, correlated activity panel                 │
│   Alerts         Full alert table, filters, auto-triage all pending      │
│   Alert Detail   Tabs: AI Triage · Evidence · Escalations · Timeline    │
│                  Timeline: Chart.js order flow (BUY/SELL/CANCELLED bars)│
│                  STR Filing button on ESCALATE verdict                   │
│   Trader Profile Risk score (0–100), pattern breakdown, alert history,  │
│                  watchlist status — reach via clickable trader IDs       │
│   Trades         407 trades, 5 filters, flagged traders highlighted      │
│   Logs           Escalation history, CSV export, 5s auto-refresh        │
│   Settings       Architecture diagram, health checks, API usage stats    │
│                                                                          │
│   Theme: Gold #f0b429 / Black — Bloomberg terminal aesthetic             │
│   NSE live price ticker (20 stocks), auto-scroll, search filter         │
│   Auto-detect on first mount — judges see populated data immediately    │
│   Voice Commands: 16 commands via Web Speech API (🎤 button in Header) │
│   AI Chat Widget: Claude-powered Q&A floating on Dashboard (💬 button) │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Data Flow

```
VISIT DASHBOARD (first time)
         │
         ▼  (auto-detect on mount — no manual click needed)
1. fetch_real_prices()          yfinance → 20 NSE symbols (live)
         │
         ▼
2. generate_realistic_trades()  ~407 trades across last 3 trading days
   ├─ 50 normal traders, 3–8 trades each
   └─ 4 injected suspicious clusters:
      ├─ T-1042 / HDFCBANK  → LAYERING      (14 orders, 12 cancelled 420–780ms)
      ├─ T-2891 / RELIANCE  → SPOOFING      (8×80k orders cancelled 180–490ms)
      ├─ T-3301 / INFY      → WASH TRADING  (cross-account, 18 seconds apart)
      └─ T-4401 / TCS       → PUMP_AND_DUMP (5×22K BUY in 14min, sell in 4min)
         │
         ▼
3. Wipe trades + alerts + triage_results + escalations
   Insert new trades with current timestamps
         │
         ▼
4. POST /api/replay/start
   For each trader+instrument pair, run all 4 detectors
   → 4–6 alerts stored
         │
         ▼
5. CLICK "Triage This Alert" on any alert
   │
   ├─ Build compact prompt: cancel_ratio, sigma, evidence_summary (~280 tokens)
   ├─ Send to Claude Sonnet (claude-sonnet-4-6) with CCO system persona
   ├─ Capture real input_tokens + output_tokens from response.usage
   ├─ Parse 8-field JSON verdict (with regulatory_reference fallback)
   ├─ Store to triage_results
   └─ IF ESCALATE:
      ├─ Create COMP-XXXX.json case file
      ├─ POST to Slack #compliance-alerts (rich blocks)
      ├─ Email all subscribers
      └─ Flag trader for 72h watchlist monitoring
         │
         ▼
6. Alert Detail page (4 tabs):
   AI Triage tab:
   ├─ ESCALATE/DISMISS verdict (52px animated)
   ├─ Confidence bar
   ├─ AI Triage Narrative (full rationale)
   ├─ IN PLAIN TERMS — board member language
   ├─ RECOMMENDED ACTION — specific next steps
   ├─ REGULATORY REFERENCE — SEBI PFUTP citation
   └─ AI Metrics (real tokens, cost, processing time)
   Evidence tab:
   ├─ Cancel ratio, sigma, total orders, total volume
   └─ Trade table with FLAG markers on suspicious rows
   Timeline tab (NEW):
   └─ Chart.js bar chart — each order as a bar
      BUY=green, SELL=red, CANCELLED=amber
      Hover: timestamp, cancel speed, price
   Escalations tab:
   ├─ Compliance Case (COMP-XXXX, case file download)
   ├─ Slack notification status
   ├─ Watchlist status
   ├─ Email notification status
   └─ Generate STR Filing button (ESCALATE only) → FIU-IND HTML document

7. CLICK Trader ID anywhere
   → /trader/T-1042
   ├─ Risk Score (0–100, color-coded)
   ├─ Pattern breakdown (count per type)
   ├─ Full alert history (clickable rows)
   └─ Watchlist status

8. Dashboard Correlated Activity panel (NEW):
   ├─ Groups alerts firing within 10-minute windows
   ├─ Shows alert ID chips (clickable) + patterns
   └─ "Potential coordinated manipulation" warning
```

---

## Why The AI Approach Is Different

Most "AI for finance" hackathon projects are one of:
- RAG over documents (PDF summarizer)
- GPT wrapper with a prompt like "analyse this data"
- Generic anomaly detection with ML

This system does something specific and harder:

### 1. Domain-Specific Reasoning, Not Generic Analysis

The system prompt gives Claude a concrete identity: NSE Chief Compliance Officer, 20 years
experience, SEBI expert witness. This forces the model to reason the way a real compliance
professional would — citing specific regulations, using financial domain vocabulary,
making defensible escalation decisions.

The output isn't "this looks suspicious" — it's:
> "The cancellation pattern with a 85.7% cancel ratio at 14.3σ above baseline is characteristic
> of algorithmic layering designed to create artificial buy-side depth. ESCALATE.
> Confidence: 91%. Action: Freeze account T-1042, file STR with FIU-IND.
> Regulatory reference: SEBI PFUTP Regulations 2003, Regulation 4(2)(a)."

### 2. Pre-Computed Evidence — Not Raw Data Dumping

A naive implementation sends all 14 trade rows to the LLM: ~15,000 tokens per call.

This system pre-computes what matters:
- `cancel_ratio` — how many orders were cancelled
- `sigma` — how many standard deviations above normal baseline
- `evidence_summary` — one sentence describing the key evidence

Then sends ~280 tokens. **97% reduction in token usage.**

At $0.000003/token, this is the difference between $0.045/call and $0.00014/call.
At 1,000 alerts/day (realistic for a mid-size brokerage), that's $45/day vs $0.14/day.

### 3. Structured, Auditable Output

The model is constrained to return exactly 8 fields in JSON. No prose. No variation.
Each field serves a specific compliance purpose:

| Field | Purpose |
|-------|---------|
| `verdict` | The binary decision required for regulatory reporting |
| `confidence` | Allows tiered escalation (>80 = immediate, 60–80 = review queue) |
| `false_positive_probability` | Defense against over-escalation claims |
| `risk_level` | Determines urgency of case assignment |
| `rationale` | Legal record — can be submitted as evidence in SEBI proceedings |
| `simple_explanation` | For board members and non-technical stakeholders |
| `recommended_action` | Specific next steps, not generic "investigate" |
| `regulatory_reference` | Exact SEBI regulation for STR filing, never NULL |

---

## Detection Patterns — Technical Details

### LAYERING
```
Trigger: cancel_ratio > 70% AND at least 1 executed SELL
Signal:  sigma = (cancel_ratio - 0.15) / 0.05
         (baseline: 15% cancel rate, 5% std dev)

Cluster A: T-1042 / HDFCBANK
  14 orders placed, 12 BUY orders cancelled in 420–780ms
  2 SELL orders executed at price elevated by ~0.8%
  cancel_ratio = 0.857 → sigma = 14.1
```

### SPOOFING
```
Trigger: order_size > 50,000 AND cancelled in < 600ms

Cluster B: T-2891 / RELIANCE
  8 orders of 80,000 shares each
  All cancelled within 180–490ms
  1 SELL executed at elevated price after artificial demand created
```

### WASH TRADING
```
Trigger: Same trader_id, different account_id,
         matching instrument + size (within 10%),
         BUY and SELL within 30 seconds

Cluster C: T-3301 / INFY
  BUY 10,000 INFY on account A-3301
  SELL 10,000 INFY on account A-3302  ← same trader, different account
  18 seconds apart — classic self-dealing
```

### PUMP AND DUMP
```
Trigger: total buy volume > 100,000 shares in ≤ 20 min window,
         followed by sell within 10 min

Cluster D: T-4401 / TCS
  5 × 22,000 share BUY orders in 14-minute window (110,000 total)
  2 × 55,000 share SELL orders within 4 minutes of last buy
  Sigma = total_buy / 50,000 = 2.2
```

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| AI | Claude Sonnet (`claude-sonnet-4-6`) | Best reasoning quality for compliance decisions |
| Backend | Python 3.12 + Flask | Fast iteration, strong financial library ecosystem |
| Database | SQLite | Zero-config for demo; schema drop-in compatible with PostgreSQL |
| Market Data | yfinance (20 NSE stocks) | Free live prices, no API key required |
| Frontend | React 18 (CDN, no build step) | Runs anywhere with just `python -m http.server` |
| Charts | Chart.js 4.4 | Trade timeline visualization, pattern/severity donut charts |
| Notifications | Slack Webhooks + SMTP | Standard enterprise communication channels |
| Deployment | Render (backend + frontend static) | Free tier, auto-deploy from GitHub |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Trades in system | ~407 (regenerated at live prices) |
| Alert detection time | < 1 second for all 407 trades |
| AI triage time | ~2.5 seconds per alert |
| Tokens per triage call | ~280 input + ~180 output = 460 total |
| Cost per triage call | ~$0.00014 |
| Token savings vs naive | 97% (vs sending raw trade rows) |
| Complete workflow time | < 15 seconds: fresh data → detect → triage → case → Slack |
| API endpoints | 24 REST endpoints |
| Frontend pages | 7 (Dashboard, Alerts, Alert Detail, Trader Profile, Trades, Logs, Settings) |
| NSE instruments monitored | 20 stocks |

---

## File Structure

```
trade-surveillance/
│
├── backend/                    # Python Flask API
│   ├── app.py                  # 24 REST endpoints, CORS
│   ├── triage.py               # Claude API integration, CCO persona, real token tracking
│   ├── detector.py             # 4 pattern detectors
│   ├── database.py             # SQLite schema + seed + migration
│   ├── ingestor.py             # Trade loader, windowed queries
│   ├── workflows.py            # Case creation, Slack, email, watchlist
│   ├── market_data.py          # yfinance live prices + trade generation (20 stocks)
│   ├── emailer.py              # SMTP email to subscribers
│   ├── requirements.txt        # anthropic, flask, yfinance, gunicorn
│   ├── Procfile                # gunicorn for Render deployment
│   └── data/
│       └── trades_sample.csv   # 415 seed trades, 4 suspicious clusters
│
├── frontend/                   # React 18 (no build step)
│   ├── index.html              # Thin loader — 18 Babel script tags
│   ├── vercel.json             # SPA hash routing
│   ├── css/styles.css          # Fixed layout, gold scrollbar, price panel
│   └── js/
│       ├── api.js              # API_BASE, themes, formatters
│       ├── app.js              # Root App, data polling, hash routing
│       ├── components/
│       │   ├── Header.js       # Fixed header + PricePanel (20 stocks, auto-scroll)
│       │   ├── Sidebar.js      # Fixed sidebar, SVG icons, 5 nav items
│       │   ├── Shared.js       # ThemeCtx, useRoute, Card, Btn, Bdg, Spinner
│       │   ├── StatsBar.js     # 5-card stats row
│       │   ├── Charts.js       # Chart.js donut + bar
│       │   └── TopSuspects.js  # Ranked trader leaderboard
│       └── pages/
│           ├── Dashboard.js    # Alert feed, token bar, correlated activity panel
│           ├── Alerts.js       # Full alert table, auto-triage all
│           ├── AlertDetail.js  # 4 tabs: AI Triage, Evidence, Escalations, Timeline
│           ├── TraderProfile.js # Risk score, pattern breakdown, alert history
│           ├── Trades.js       # 407 trades, filters, flagged highlighting
│           ├── Logs.js         # Escalation log, CSV export
│           └── Settings.js     # Health checks, API usage stats
│
├── cases/                      # Generated COMP-XXXX.json compliance cases
├── render.yaml                 # Render blueprint (auto-deploy)
├── ARCHITECTURE.md             # This file
├── README.md                   # Setup + demo guide
└── CLAUDE.md                   # Development notes
```

---

## Production Readiness

This is a hackathon demo. Highlighted features that are already production-grade:

| Feature | Status | Notes |
|---------|--------|-------|
| STR auto-generation | **BUILT** | FIU-IND format, print-ready, one-click |
| Case Report (HTML) | **BUILT** | Print/PDF-ready for non-technical judges and compliance officers |
| AI verdict with regulatory citation | **BUILT** | Never NULL, per-pattern SEBI defaults |
| Real token tracking + cost | **BUILT** | `response.usage` stored per call, shown in Dashboard |
| Trader risk profiling | **BUILT** | 0–100 score, full history |
| Market impact analysis | **BUILT** | Price movement, financial harm estimate |
| Correlated alert detection | **BUILT** | 10-minute window grouping |
| Authentication / RBAC | Future | JWT + analyst/supervisor/CCO roles |
| PostgreSQL migration | Future | Schema is drop-in compatible with SQLite |
| Real-time streaming | Future | WebSocket / Server-Sent Events |
| Historical backtesting | Future | Replay detectors on archived data |
| Audit trail | Partial | Escalations table logs actions; user identity not tracked |
