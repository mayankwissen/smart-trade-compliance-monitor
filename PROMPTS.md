# AI Prompts Used — Trade Surveillance Engine
## Wissen Technology Hackathon 2026
### Built by: Mayank Gupta | Wissen Technology

This document contains every prompt given to Claude AI (via Claude CLI and Claude.ai)
to build this project from scratch in ~46 hours.

---

## PROMPT 1 — Initial Project Scaffold

**Purpose:** Build complete base project from scratch
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~3,000

```
You are a senior full-stack engineer. Build a complete "Trade Surveillance & Alert Triage Engine"
project from scratch in the current directory. This is for a hackathon judged on: AI triage
quality (25%), pattern detection (20%), automation workflows (20%), working demo (20%),
API efficiency (10%), and documentation (5%).

TECH STACK:
- Backend: Python 3, Flask, SQLite (via sqlite3), anthropic SDK
- Frontend: Single-file React 18 app via CDN (no build step), dark navy/indigo theme
- Claude API model: claude-sonnet-4-5
- API key: loaded from .env file as ANTHROPIC_API_KEY

PROJECT STRUCTURE:
trade-surveillance/
├── backend/
│   ├── app.py
│   ├── ingestor.py
│   ├── detector.py
│   ├── triage.py
│   ├── workflows.py
│   ├── database.py
│   └── data/trades_sample.csv
├── frontend/index.html
├── cases/
├── .env.example
├── requirements.txt
└── README.md

[Full prompt covered: CSV generation with 300 NSE trades, 3 suspicious clusters
(LAYERING trader T-1042, SPOOFING trader T-2891, WASH TRADING trader T-3301),
SQLite database setup, pattern detectors, Claude triage engine, Slack/watchlist
workflows, Flask API with 8 endpoints, React dashboard, requirements.txt,
render.yaml, README.md]

Do not ask clarifying questions. Build everything now.
```

**Output:** Complete working project — 12 files, 300 synthetic trades,
3 pattern detectors, Claude triage working, Slack notifications firing

---

## PROMPT 2 — Real NSE Market Data Integration

**Purpose:** Replace hardcoded fake prices with live NSE data via yfinance
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~2,500

```
Enhance the data layer to use real NSE market data.

1. Install yfinance
2. Create backend/market_data.py:
   - fetch_real_prices(): fetches live prices for HDFCBANK.NS, RELIANCE.NS,
     INFY.NS, TCS.NS, ICICIBANK.NS, WIPRO.NS, SBIN.NS via yfinance
   - generate_realistic_trades(prices): generates synthetic orders at REAL
     current market prices
   - Falls back to hardcoded prices if market is closed

3. Add GET /api/market-prices to app.py
4. Add scrolling price ticker to frontend header showing live NSE prices
   with ▲/▼ indicators, auto-refreshes every 60 seconds

After implementing:
pip install yfinance --break-system-packages
curl http://localhost:5000/api/market-prices
Show me the real prices returned.

Do not ask questions. Implement now.
```

**Output:** market_data.py created, live prices working:
HDFCBANK ₹748, RELIANCE ₹1291.50, INFY ₹1199, TCS ₹2196,
ICICIBANK ₹1260.30, WIPRO ₹198.05, SBIN ₹977

---

## PROMPT 3 — Bloomberg Terminal UI Rewrite

**Purpose:** Replace basic blue UI with professional Bloomberg Terminal aesthetic
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~60,000

```
Rewrite frontend/index.html completely from scratch.
Financial compliance dashboard for a bank.
Bloomberg Terminal meets modern SOC dashboard.
Single page, all sections visible at once.

COLORS — PREMIUM DARK GOLD:
Page bg: #0a0a0a | Card bg: #141414 | Border: #2a2a2a
Primary accent: #f0b429 (GOLD) | Success: #22c55e
Danger: #ef4444 | Text: #ffffff

FONTS: Inter (UI) + JetBrains Mono (data)

SECTION 1 — HEADER (64px, bg=#000000):
- Gold bottom border 2px
- "TRADE SURVEILLANCE ENGINE" in gold
- Scrolling NSE live price ticker
- Email subscribe input + Subscribe button
- START REPLAY button

SECTION 2 — STATS BAR (5 cards):
Total Trades | Alerts | Escalated | Dismissed | Pending
Big numbers, colored borders, count-up animation

SECTION 3 — MAIN AREA (60/40 split):
Left: Alert table with colored badges + Chart.js charts
Right: Triage detail panel + Top Suspects leaderboard

SECTION 4 — ESCALATION LOG (full width):
Color coded by action type, auto-refresh

ANIMATIONS: fadeInUp, pulse, scaleIn, confidence bar 0→actual%

Do not ask questions. Rewrite now.
After writing confirm file size in KB.
```

**Output:** 80KB professional dashboard with gold/black theme,
Chart.js donut + bar charts, animated verdict reveal,
live price ticker, top suspects leaderboard

---

## PROMPT 4 — Master Enhancement (Multi-page + All Features)

**Purpose:** Convert single page to 6-page app with all advanced features
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~45,000

```
Major enhancements to existing project. Do not ask questions. Implement in order.

ENHANCEMENT 1: Fix data issues
- Fix duplicate alert detection
- Increase to 400 trades with more variety
- Change /api/refresh-data to POST

ENHANCEMENT 2: Multi-page layout with hash routing
Pages: #/ Dashboard | #/alerts Alerts | #/alert/:id Detail
       #/trades Explorer | #/logs Logs | #/settings Settings
Left sidebar 60px with icons

ENHANCEMENT 3: Email notifications
- Create emailer.py using smtplib
- HTML email template — dark themed
- POST /api/subscribe endpoint
- Send to all subscribers on ESCALATE

ENHANCEMENT 4: Token stats endpoint
GET /api/token-stats → total calls, tokens, cost estimate

ENHANCEMENT 5: Trader profile endpoint
GET /api/trader/:id → all alerts, triage, risk score

ENHANCEMENT 6: Complete UI — Gold/Black Bloomberg theme
- All 6 pages fully built
- Dark/light toggle stored in localStorage
- Inter + JetBrains Mono fonts
- API_BASE auto-detects localhost vs production

ENHANCEMENT 7: Deployment config
- render.yaml for Render deployment
- gunicorn in requirements.txt
- /api/ping keep-alive endpoint

After all changes delete surveillance.db and test full flow.
Do not ask questions. Implement everything now.
```

**Output:** 6-page multi-page app, emailer.py, 20+ endpoints,
gold theme with dark/light toggle, deployment config ready

---

## PROMPT 5 — Full Project Audit and Bug Fix

**Purpose:** AI-powered code review to find and fix all bugs before deployment
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~8,000

```
You are a senior full-stack developer and hackathon judge.
Scan the entire project. Read every file completely.

Report:
SECTION 1: What is working (be specific)
SECTION 2: What is broken (file, line, fix)
SECTION 3: What is missing vs hackathon requirements
SECTION 4: UI problems
SECTION 5: Judge scores per criteria with reasons
SECTION 6: Top 5 things to fix RIGHT NOW
SECTION 7: Explain the project in simple words

Then fix everything found. Do not ask questions.
```

**Bugs found and fixed:**
- detector.py: removed unused `from itertools import combinations`
- app.py: removed unused `timedelta` import, fixed null check order in export_case
- triage.py: wrapped json.loads() in try/except JSONDecodeError
- README.md: fixed word-break artifacts, updated trade count 300→415,
  max_tokens 300→500, added all 20 endpoints
- frontend: fixed Settings Slack health check (removed browser process?.env),
  fixed Top Suspects navigation, added Refresh Live Data button,
  fixed light mode gold color visibility

---

## PROMPT 6 — SEBI-Quality Triage Analysis

**Purpose:** Upgrade Claude prompts to match exact problem statement output format
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~3,000

```
Update triage.py only. Do not change anything else.

Change SYSTEM_PROMPT to:
"You are a Chief Compliance Officer at NSE (National Stock Exchange of India)
with 20 years of experience in market surveillance and SEBI regulatory proceedings.
You have testified as an expert witness in multiple market manipulation cases.
You analyze trade alerts and produce verdicts that can be submitted as evidence
to SEBI. Respond ONLY with valid JSON. No text outside the JSON."

Add 4 new fields to JSON response:
- risk_level: CRITICAL/HIGH/MEDIUM/LOW
- simple_explanation: plain English for non-traders
- recommended_action: specific next step for compliance team
- regulatory_reference: applicable SEBI regulation

max_tokens: 600

Add these columns to triage_results table.
Update Alert Detail page to show:
- AI TRIAGE NARRATIVE box (monospace, matches problem statement format)
- IN PLAIN TERMS box (blue border)
- RECOMMENDED ACTION box (amber border)
- REGULATORY REFERENCE box (purple border)
- AI METRICS box showing tokens, cost, processing time

Do not ask questions. Implement now.
```

**Output:** SEBI-quality verdicts with regulatory citations,
plain English explanations, recommended actions,
AI metrics visible to judges

---

## PROMPT 7 — Frontend Restructure + Layout Fix

**Purpose:** Proper folder structure, fix scrolling at 100% zoom
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~80,000

```
Two tasks. Do both completely. Do not ask questions.

TASK 1: Fix layout and scrolling
- html/body: min-height 100vh, overflow auto
- Sidebar: position fixed, 72px wide, 100vh
- Header: position fixed, top 0, left 72px
- Main content: margin-left 72px, margin-top 64px,
  height calc(100vh - 64px), overflow-y auto
- All tables: tbody scrollable, max-height 280px
- Gold scrollbar: width 6px, thumb #f0b429
- Font sizes: table 13px, badges 11px, stats 32px

TASK 2: Restructure frontend folder
frontend/
├── index.html
├── vercel.json
├── css/styles.css
└── js/
    ├── api.js
    ├── app.js
    ├── components/ (Header, Sidebar, StatsBar, Charts, TopSuspects)
    └── pages/ (Dashboard, Alerts, AlertDetail, Trades, Logs, Settings)

Rules:
- All JS uses type="text/babel" via CDN
- Load order: CDN → styles.css → api.js → components → pages → app.js
- Keep ALL existing functionality working

Do not ask questions. Implement now.
```

**Output:** Proper folder structure, scrolling fixed,
all 6 pages working, professional layout

---

## PROMPT 8 — QA Bug Fixes (Final)

**Purpose:** Fix 13 bugs found in pre-hackathon QA scan

**Bugs fixed:**
- `workflows.py`: `datetime.utcnow()` → `datetime.now(timezone.utc)` (5 places, Python 3.12 deprecation)
- `database.py`: Added `input_tokens`/`output_tokens` to `CREATE TABLE` schema
- `ingestor.py`: Removed dead `replay_trades()` function and unused `import time`
- `emailer.py`: Used real `false_positive_probability` from triage result instead of `100 - confidence`
- `detector.py`: Removed `from datetime import datetime as dt` from inside loop bodies
- `app.py`: Removed wildcard `*` from CORS origins; added idempotency guard to `POST /api/triage/:id`; fixed `/api/token-stats` model field
- `market_data.py`: Added 5-minute in-memory price cache to reduce yfinance cold-start time
- `triage.py`: Increased `max_tokens` from 600 → 1024 to prevent JSON truncation
- Frontend: Updated all hardcoded `claude-sonnet-4-5` strings to `claude-sonnet-4-6`
- `AlertDetail.js`: AI Metrics panel now shows real `input_tokens`/`output_tokens` from DB
- `render.yaml`: Changed to `--workers 1 --threads 4` for free-tier RAM safety

**Tokens used:** ~5,000

---

## PROMPT 9 — Advanced Features

**Purpose:** Add advanced compliance and analysis features beyond core triage

**Features added:**
- **STR Auto-Generator** (`/api/generate-str/:id`): Print-ready FIU-IND Suspicious Transaction Report filing in HTML with all 5 regulatory sections
- **Trade Timeline Chart**: Chart.js bar chart in 4th tab of AlertDetail showing BUY/SELL/CANCELLED order flow
- **Trader Risk Profile** (`/api/trader/:id` + `/trader/:id` page): Risk score 0–100, pattern breakdown, alert history, watchlist status
- **Market Impact Calculator** (`/api/market-impact/:id`): Price movement %, financial harm estimate in INR, affected investor count
- **Alert Correlation Detection** (`/api/correlated-alerts` + Dashboard panel): Groups alerts within 10-minute windows to identify coordinated manipulation

**Tokens used:** ~40,000

---

## PROMPT 10 — Case Report HTML Export

**Purpose:** Replace raw JSON download with a human-readable, print-ready HTML compliance report
**Model:** Claude Sonnet 4.6 via Claude CLI
**Estimated tokens:** ~2,000

```
also when i am downloading the file download case file its in json ??
is it correct a non tech person cant understand
```

**Changes made:**
- `/api/export/case/<alert_id>` in `app.py` — completely rewritten to return formatted HTML
  instead of raw JSON with `Content-Disposition: attachment`
- Report sections:
  1. **Header** — black bar with case reference, export timestamp, "NSE Compliance Division"
  2. **Meta bar** — Alert ID, Trader, Instrument, Severity in 4-column grid
  3. **Section 1 — Pattern Detected** — stats grid (pattern type, cancel %, sigma, total orders)
     + evidence summary + detected timestamp
  4. **Section 2 — AI Triage Verdict** — verdict in 48px colored text (red/green), confidence
     bar, rationale, plain-English explanation, recommended action, regulatory reference
  5. **Section 3 — Escalation Actions** — color-coded action list with timestamps
  6. **Section 4 — Order Evidence** — first 50 orders in a table with BUY/SELL/CANCELLED
     color coding, price in ₹, cancel time in ms
- "Print / Save as PDF" button at top — judges can print without any developer tools
- `@media print` CSS rule hides the print button when printing
- Frontend button in `AlertDetail.js` updated: label changed from "Download Case File" to
  "Case Report (Print/PDF)", icon changed from download arrow to document icon

**Output:** Non-technical judges and compliance officers can now open the case report in a
browser, read it like a formal compliance document, and save it as PDF with one click.

**Tokens used:** ~2,000

---

## TOTAL AI USAGE SUMMARY

| Prompt | Purpose | Est. Tokens | Time |
|--------|---------|-------------|------|
| 1 | Base scaffold | ~3,000 | 10 min |
| 2 | Real NSE data | ~2,500 | 5 min |
| 3 | Bloomberg UI | ~60,000 | 20 min |
| 4 | Master features | ~45,000 | 15 min |
| 5 | Bug audit + fix | ~8,000 | 5 min |
| 6 | SEBI triage | ~3,000 | 5 min |
| 7 | Restructure | ~80,000 | 25 min |
| 8 | QA Bug Fixes | ~5,000 | 10 min |
| 9 | Advanced Features | ~40,000 | 15 min |
| 10 | HTML Case Report | ~2,000 | 5 min |
| **Total** | **Full project** | **~248,500** | **~105 min** |

---

## KEY PROMPT ENGINEERING DECISIONS

### Token Efficiency Strategy
Instead of sending all 415 raw trade rows to Claude (~15,000 tokens),
the system pre-computes statistics locally and sends only:
- cancel_ratio (single float: 0.857)
- sigma (single float: 14.14)
- evidence_summary (one sentence)
- pattern_type, severity, trader_id, instrument

**Result: ~280 tokens input per triage call vs ~15,000 tokens**
**Token savings: 97% reduction**

### Persona Engineering
System prompt uses expert persona: "Chief Compliance Officer at NSE,
20 years experience, testified as expert witness in SEBI proceedings"

This produces dramatically better output quality vs generic "you are an analyst" prompt.

### Structured Output Enforcement
JSON schema provided in prompt with exact field names and value constraints.
Markdown fence stripping in triage.py handles cases where Claude wraps JSON.
try/except JSONDecodeError prevents 500 errors on bad responses.

### Few-shot Formatting
Problem statement example output was included in prompt context to guide
Claude toward the exact format judges expect to see.
