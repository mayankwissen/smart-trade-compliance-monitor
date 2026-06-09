
export const meta = {
  name: 'build-5-features',
  description: 'Build STR generator, trade timeline chart, trader profile page, market impact, alert correlation panel',
  phases: [
    { title: 'Backend', detail: 'Add 4 new API endpoints to app.py' },
    { title: 'Frontend', detail: 'Build 4 frontend features in parallel across different files' },
  ],
}

// ── PHASE 1: Backend (sequential — all new endpoints in one file) ──────────────
phase('Backend')
await agent(`You are working on a NSE trade surveillance system. Your job is to add 4 new API endpoints to backend/app.py.

PROJECT CONTEXT:
- Flask + SQLite backend
- File: C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\backend\\app.py
- SQLite via get_db() from database.py
- All imports already at top: Flask, jsonify, request, Response, uuid, json, datetime, timezone
- DB tables: trades, alerts, triage_results, escalations, subscribers

TASK: Read the full app.py first, then add these 4 endpoints BEFORE the final "if __name__ == '__main__'" block:

=== ENDPOINT 1: STR Generator ===
Route: GET /api/generate-str/<alert_id>
Returns: HTML document (Response with mimetype='text/html') — a professional Suspicious Transaction Report (STR) for FIU-IND submission
Logic:
1. Fetch alert from DB by alert_id (return 404 if not found)
2. Fetch triage_result for this alert (may be None)
3. Fetch all trades for this trader+instrument ordered by timestamp
4. Compute STR reference: "STR-NSE-" + first 8 chars of alert_id uppercased
5. Return a complete, styled HTML page with:
   - NSE header with "SUSPICIOUS TRANSACTION REPORT" title
   - Grid: STR reference, filing date (datetime.now().strftime("%d %B %Y")), reporting entity (NSE), reported to (FIU-IND)
   - Section 1: Alert Reference, Detection Date, Trader ID, Instrument, Pattern type (replace _ with space), Severity
   - Section 2: Evidence Summary, Statistical indicators (cancel_ratio*100 as %, sigma value)
   - Section 3 (only if triage exists): AI Verdict (styled), Confidence%, False Positive%, Risk Level, Rationale, Recommended Action, Regulatory Reference, Processing time
   - Section 4: Table of first 50 trades (timestamp, order_type, order_size formatted with :,, price formatted as ₹X.XX, order_status, cancel_time_ms)
   - Section 5: Regulatory basis (SEBI PFUTP 2003, PMLA 2002)
   - Footer: generation timestamp, confidentiality notice
   - Print button (onclick="window.print()", class="no-print", styled in dark)
   - @media print CSS to hide .no-print elements
   The HTML should use: font-family Arial; dark header (background #1a1a1a, color #fff); field labels uppercase 11px gray; field values in #f5f5f5 box with left border; professional table with dark header row
   Verdict styling: class="verdict" where ESCALATE is color #dc2626 bold, DISMISS is #16a34a bold

=== ENDPOINT 2: Trader Profile ===
Route: GET /api/trader/<trader_id>
Returns: JSON with:
{
  "trader_id": str,
  "risk_score": int (0-100),
  "alerts": [...all alerts for this trader as dicts, with triage verdict joined if exists],
  "pattern_counts": {"LAYERING": n, "SPOOFING": n, "WASH_TRADING": n, "PUMP_AND_DUMP": n},
  "escalation_count": int,
  "watchlisted": bool (true if any WATCHLIST_FLAGGED escalation exists for this trader),
  "total_trades": int
}
Risk score logic:
- Start at 0
- Each ESCALATED alert with verdict ESCALATE: +30
- Each HIGH severity alert: +20  
- Each MEDIUM severity alert: +10
- Cap at 100
Join triage for each alert using: SELECT t.verdict, t.confidence, t.risk_level FROM triage_results t WHERE t.alert_id = a.alert_id
Add "triage_verdict", "triage_confidence", "triage_risk_level" fields to each alert dict (None if no triage)

=== ENDPOINT 3: Market Impact ===
Route: GET /api/market-impact/<alert_id>
Returns: JSON with estimated market impact for this alert
{
  "alert_id": str,
  "instrument": str,
  "price_move_pct": float,  -- (max_price - min_price) / min_price * 100
  "min_price": float,
  "max_price": float,
  "total_volume_shares": int,  -- sum of all order_sizes for this trader+instrument
  "total_volume_inr": float,   -- sum of order_size * price
  "suspicious_volume_inr": float,  -- sum for CANCELLED orders only
  "estimated_harm_inr": float,  -- suspicious_volume_inr * (price_move_pct/100) * 0.35
  "affected_investor_estimate": int,  -- rough: max(50, int(total_volume_shares / 5000))
  "sigma": float,
  "manipulation_window_min": float  -- (max_timestamp - min_timestamp).total_seconds() / 60
}
Fetch all trades WHERE trader_id=alert.trader_id AND instrument=alert.instrument
Compute from those trades. Handle edge cases: if no trades or min_price==0, return zeros.
Parse timestamps with datetime.fromisoformat()

=== ENDPOINT 4: Correlated Alerts ===
Route: GET /api/correlated-alerts
Returns: JSON with groups of alerts that fired within 10-minute windows
{
  "groups": [
    {
      "window_start": str (ISO),
      "window_end": str (ISO),
      "alert_count": int,
      "duration_minutes": float,
      "patterns": [str, ...] -- unique pattern types in this group
      "traders": [str, ...] -- unique trader IDs
      "alerts": [...alert dicts with triage joined]
    },
    ...
  ],
  "total_groups": int
}
Logic:
1. Fetch ALL alerts ordered by detected_at ASC, joined with triage_results (LEFT JOIN)
2. Sort by detected_at
3. Sliding window: for each alert i, find all alerts j where abs(detected_at[j] - detected_at[i]) <= 600 seconds
4. Only include groups with 2+ alerts
5. Deduplicate: once an alert is in a group, don't start a new group from it
   (use a "used" set of alert_ids)

CRITICAL RULES:
- Do NOT break any existing endpoints
- Use get_db(), conn.close() pattern consistently
- Wrap each endpoint body in try/except, return {"error": str(e)}, 500 on failure
- All datetime operations must handle None timestamps gracefully
- Read the full file first to find the correct insertion point (before if __name__)
- Add a comment "# ── New Analysis Endpoints ─────────────────────────────────────────────────" before the 4 new endpoints

The file is at: C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\backend\\app.py
`, { label: 'backend-endpoints', phase: 'Backend' })

// ── PHASE 2: Frontend (4 agents in parallel, each touches a different file) ──
phase('Frontend')
await parallel([

  // ── Agent A: AlertDetail.js ───────────────────────────────────────────────
  () => agent(`You are working on a NSE trade surveillance frontend (React 18 via CDN + Babel Standalone).

FILE TO MODIFY: C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\frontend\\js\\pages\\AlertDetail.js

Read the file first. Then make these 3 changes:

CHANGE 1 — Add a "Timeline" 4th tab
The tab array currently has 3 tabs: ['triage','AI Triage'], ['evidence','Evidence'], ['actions','Escalations']
Add a 4th: ['timeline', 'Timeline']

In the tab content section, add a new section for tab === 'timeline':
This should render a Chart.js bar chart visualization of all trades for this alert.

IMPLEMENTATION:
- Define a helper function _AlertTimelineChart at the TOP of the file (before window.AlertDetailPage), outside the main component:
  function _AlertTimelineChart({ trades }) {
    const t = window.useT();
    const canvasRef = React.useRef(null);
    const chartRef = React.useRef(null);
    React.useEffect(() => {
      if (!canvasRef.current || !trades || !trades.length) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const ctx = canvasRef.current.getContext('2d');
      // Color-code bars: BUY=green, SELL=red, CANCELLED=amber
      const bgColors = trades.map(tr => {
        if (tr.order_status === 'CANCELLED') return '#f59e0b66';
        if (tr.order_type === 'BUY') return '#22c55e99';
        return '#ef444499';
      });
      const borderColors = trades.map(tr => {
        if (tr.order_status === 'CANCELLED') return '#f59e0b';
        if (tr.order_type === 'BUY') return '#22c55e';
        return '#ef4444';
      });
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: trades.map((_, i) => '#' + (i + 1)),
          datasets: [{
            label: 'Order Size (BUY=green, SELL=red, CANCELLED=amber)',
            data: trades.map(tr => tr.order_size),
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: t.text, font: { family: 'Inter', size: 11 } } },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const tr = trades[items[0].dataIndex];
                  return (tr.timestamp || '').slice(11, 19) || 'Trade ' + (items[0].dataIndex + 1);
                },
                afterBody: (items) => {
                  const tr = trades[items[0].dataIndex];
                  const lines = [tr.order_type + ' · ' + tr.order_status];
                  if (tr.cancel_time_ms > 0) lines.push('Cancelled in ' + tr.cancel_time_ms + 'ms');
                  if (tr.price) lines.push('Price: ₹' + Number(tr.price).toFixed(2));
                  return lines;
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: t.textMuted, font: { size: 9 } }, grid: { color: t.border + '33' } },
            y: { ticks: { color: t.textMuted, font: { size: 9 } }, grid: { color: t.border + '33' }, title: { display: true, text: 'Order Size', color: t.textMuted, font: { size: 10 } } },
          },
        },
      });
      return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [trades]);
    if (!trades || !trades.length) return React.createElement('div', { style: { color: t.textMuted, textAlign: 'center', padding: '40px 0', fontSize: 13 } }, 'No trade data for this alert');
    return React.createElement('div', null,
      React.createElement('div', { style: { color: t.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginBottom: 12, letterSpacing: '.08em' } },
        'TRADE SEQUENCE — ' + trades.length + ' orders · BUY (green) · SELL (red) · CANCELLED (amber)'),
      React.createElement('canvas', { ref: canvasRef, style: { maxHeight: 280, width: '100%' } })
    );
  }

- In the Timeline tab content JSX, show:
  1. A header row: "Order Flow Visualization" on left, and a legend on right showing 3 colored dots: green=BUY, red=SELL, amber=CANCELLED
  2. The _AlertTimelineChart component: <_AlertTimelineChart trades={trades} />
  3. Below the chart: a small note in textMuted "Each bar represents one order. Height = order size. Hover for details."
  4. Also show pattern-specific insight text below (show only if alert exists):
     - LAYERING: "The chart above shows the classic layering signature: a wall of cancelled orders (amber) used to create artificial price pressure before the executed sell (red)."
     - SPOOFING: "Large orders placed and immediately cancelled (amber spikes) to manipulate the perceived order book depth."
     - WASH_TRADING: "Matched buy and sell orders of near-identical size between related accounts."
     - PUMP_AND_DUMP: "Rapid accumulation phase (green cluster) followed by concentrated distribution (red)."
     Use alert.pattern_type to select the right message. Default: "Order flow analysis for this manipulation pattern."
     Style: italic, color t.textSec, fontSize 12, lineHeight 1.7, padding 12px 16px, background t.bg, border 1px solid t.border + '88', borderRadius 8, marginTop 12

CHANGE 2 — Make Trader ID clickable in the overview grid
In the alert overview grid (the 3-column grid with 8 info cells), the cell for 'Trader ID' currently shows:
  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700 }}>{alert.trader_id}</span>
Change it to a clickable element that navigates to the trader profile page:
  <span 
    onClick={() => nav('/trader/' + alert.trader_id)}
    style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
    title="View trader profile"
  >{alert.trader_id}</span>

CHANGE 3 — Add STR button in Escalations tab
In the Escalations tab, in the "Compliance Case" card (the green-bordered card with caseId), after the existing "Download Case File" button, add a second button:
  <window.Btn small variant="ghost"
    onClick={() => window.open(window.API_BASE + '/api/generate-str/' + alertId)}
    style={{ marginLeft: 8 }}>
    Generate STR Filing
  </window.Btn>
This button should only show when triage exists (triage is truthy) AND verdict === 'ESCALATE'.
So wrap it: {triage && verdict === 'ESCALATE' && <window.Btn ...>Generate STR Filing</window.Btn>}

IMPORTANT RULES:
- Preserve ALL existing code exactly — only add the 4th tab to the tab array, add the timeline tab content, change the trader ID span, and add the STR button
- The file uses React hooks aliased as: _aduseS (useState), _aduseE (useEffect), _aduseC (useCallback)  
- DO NOT use useState/useEffect/useCallback directly — use the aliases or React.useRef/React.useEffect directly
- The _AlertTimelineChart function is a standalone component defined BEFORE window.AlertDetailPage
- DO NOT add emojis anywhere
- DO NOT add comments except where logic is non-obvious
`, { label: 'alertdetail-update', phase: 'Frontend' }),

  // ── Agent B: TraderProfile.js (new file) ──────────────────────────────────
  () => agent(`You are working on a NSE trade surveillance frontend (React 18 via CDN + Babel Standalone, all via window globals).

CREATE NEW FILE: C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\frontend\\js\\pages\\TraderProfile.js

This is a brand new page component. It will be loaded via <script type="text/babel" src="js/pages/TraderProfile.js"></script> in index.html.

AVAILABLE GLOBALS (from api.js):
- window.API_BASE: backend URL
- window.useT(): returns theme object t with: t.bg, t.card, t.border, t.gold, t.text, t.textSec, t.textMuted, t.danger, t.success, t.warning, t.info, t.sidebar
- window.fmtNum(n): format number with commas
- window.fmtRs(n): format as ₹X.XX
- window.fmtDate(ts): format ISO timestamp
- window.fmtTime(ts): format time portion only
- window.PAT_CFG: {LAYERING:{bg,c}, SPOOFING:{bg,c}, WASH_TRADING:{bg,c}, PUMP_AND_DUMP:{bg,c}}
- window.SEV_CFG: {HIGH:{bg,c}, MEDIUM:{bg,c}, LOW:{bg,c}}
- window.STA_CFG: {PENDING:{bg,c}, ESCALATED:{bg,c}, DISMISSED:{bg,c}}

AVAILABLE COMPONENTS (from Shared.js):
- window.Card: {children, style, pad} — dark card with border
- window.Btn: {children, onClick, variant, small, disabled, style} — primary/ghost/danger variants
- window.Bdg: {label, cfg, lg} — badge
- window.Spinner: loading spinner
- window.EmptyState: {msg} — empty placeholder

React aliases to use at top of file:
  const { useState: _tpuseS, useEffect: _tpuseE, useCallback: _tpuseC } = React;

COMPONENT: window.TraderProfilePage = function TraderProfilePage({ traderId, nav })

FETCH: GET ${window.API_BASE}/api/trader/${traderId} → loads into state

STRUCTURE of the page (use "page-scroll" className for outer div, background t.bg):

1. BREADCRUMB ROW (marginBottom 16):
   - Back button → nav('/alerts')
   - "Trader Profile" label (muted)
   - traderId in gold JetBrains Mono bold

2. RISK SCORE CARD (full width, marginBottom 16):
   Use window.Card. Gold/black theme.
   Left side (flex): 
     - Large number: the risk_score (fontFamily JetBrains Mono, fontSize 56, fontWeight 700, color based on score: <30=t.success, 30-60=t.warning, >60=t.danger)
     - Below the number: "/ 100" in textMuted, fontSize 14
     - "RISK SCORE" label above in textMuted uppercase 10px letterSpacing .15em
   Right side (grid 4 columns):
     - ESCALATED ALERTS (count)
     - PATTERNS DETECTED (Object.values(pattern_counts).reduce sum)
     - TOTAL TRADES (total_trades)
     - WATCHLISTED (Yes/No badge)
   Each metric: JetBrains Mono bold 22px colored number, Inter 10px uppercase muted label below

3. PATTERN BREAKDOWN (marginBottom 16):
   window.Card with title "DETECTION HISTORY"
   4-column grid showing counts for LAYERING, SPOOFING, WASH TRADING, PUMP & DUMP
   Each column: colored number (use PAT_CFG color), uppercase label, use window.Bdg with PAT_CFG
   Only show patterns with count > 0 (but always show at least a "—" if all zero)

4. ALERT HISTORY TABLE (marginBottom 16):
   window.Card with title "ALERT HISTORY"
   Table className="dt" with columns: ALERT ID, PATTERN, INSTRUMENT, SEVERITY, STATUS, DETECTED AT, AI VERDICT
   For each alert in data.alerts:
     - Alert ID: clickable in gold JetBrains Mono, onClick={() => nav('/alert/' + a.alert_id)}, cursor pointer, underline dotted
     - Pattern: window.Bdg with PAT_CFG
     - Instrument: bold white
     - Severity: window.Bdg with SEV_CFG
     - Status: window.Bdg with STA_CFG
     - Detected At: fmtDate(a.detected_at) in textMuted JetBrains Mono 11px
     - AI Verdict: if a.triage_verdict exists, show Bdg (ESCALATE={bg:'#ef444422',c:'#ef4444'}, DISMISS={bg:'#22c55e22',c:'#22c55e'}); else show "—" in textMuted
   Empty state if no alerts.
   Table wrapped in div className="dt-wrap" style={{overflowX:'auto'}}

5. WATCHLIST STATUS CARD (only render if data.watchlisted === true):
   window.Card with orange/amber border (borderLeft: '3px solid ' + t.warning)
   Show: "Trader {traderId} is currently under enhanced monitoring (72-hour watchlist)"
   Small badge: "WATCHLIST ACTIVE" amber

LOADING STATE: center <window.Spinner />
ERROR STATE: "Trader not found" in textMuted centered

STYLING RULES:
- Font: Inter for labels, JetBrains Mono for IDs/numbers/code
- No emojis anywhere
- Dark Bloomberg terminal aesthetic matching existing pages
- Do not hardcode colors — use t.* from useT()
- Keep components concise, no unnecessary nesting
- All onClick handlers for navigation use the nav prop
`, { label: 'trader-profile-page', phase: 'Frontend' }),

  // ── Agent C: Dashboard.js — Add Correlation Panel ─────────────────────────
  () => agent(`You are working on a NSE trade surveillance frontend (React 18 via CDN + Babel Standalone).

FILE TO MODIFY: C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\frontend\\js\\pages\\Dashboard.js

Read the full file first. Then make ONE change: add a "Correlated Activity" panel.

WHAT TO ADD:
After the existing alert feed (the paginated list of alerts), add a new section that groups alerts firing within a 10-minute window and displays them as a "potential coordinated activity" warning.

HOW TO COMPUTE CORRELATIONS (pure inline computation, no extra state, no API call):
Compute this inline in the render function body (before the return statement), assigned to a const:

const _corrGroups = (() => {
  if (localAlerts.length < 2) return [];
  const sorted = [...localAlerts].sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at));
  const groups = [];
  const used = new Set();
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].alert_id)) continue;
    const base = new Date(sorted[i].detected_at).getTime();
    const group = [sorted[i]];
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].alert_id)) continue;
      const diff = (new Date(sorted[j].detected_at).getTime() - base) / 1000;
      if (diff <= 600) { group.push(sorted[j]); used.add(sorted[j].alert_id); }
    }
    if (group.length >= 2) {
      used.add(sorted[i].alert_id);
      groups.push(group);
    }
  }
  return groups;
})();

JSX TO RENDER (only when _corrGroups.length > 0):
Add this AFTER the pagination controls, BEFORE the end of the component's return JSX.

Render a window.Card with:
- Header row: left: "CORRELATED ACTIVITY" label (uppercase, 10px, textMuted, JetBrains Mono, letterSpacing .12em); right: a badge showing _corrGroups.length + " GROUP" + (_corrGroups.length > 1 ? 'S' : '') with amber styling (bg: t.warning+'22', color: t.warning)
- A thin divider (border-top 1px solid t.border, margin 12px 0)
- For each group in _corrGroups, a row styled with:
  - background: t.card (slightly elevated), borderRadius 8, padding '12px 16px', marginBottom 8, border '1px solid ' + t.border
  - Left: 
    - "POTENTIAL COORDINATED ACTIVITY" in danger color (t.danger), fontSize 10, fontWeight 700, letterSpacing .1em, fontFamily Inter
    - Below: group.length + " alerts within " + Math.round((new Date(group[group.length-1].detected_at) - new Date(group[0].detected_at))/1000/60*10)/10 + "-min window" in textSec fontSize 12
  - Right (flex gap 6, flex-wrap wrap): 
    - For each alert in the group: a small clickable chip showing the alert_id in JetBrains Mono 10px, background t.gold+'18', color t.gold, borderRadius 4, padding '2px 8px', cursor pointer, onClick={() => nav('/alert/' + a.alert_id)}
  - Far right: unique patterns as small Bdg using PAT_CFG
- Below the groups list: a muted note (fontSize 11, textMuted): "Alerts within 10-minute windows may indicate coordinated manipulation. Investigate together."

IMPORTANT RULES:
- DO NOT change anything else in the file — only add _corrGroups computation and the new JSX section
- The file uses React hooks aliased as: _duseS (useState), _duseE (useEffect)
- Do NOT add useState for the correlated groups — compute inline as shown
- Do NOT add emojis
- Find where to add the JSX: look for the pagination controls (the row with prev/next buttons and page numbers) — add the correlated panel AFTER those controls but still inside the main return JSX
- Read the full file to understand exactly where to insert
- Wrap the new panel in: {_corrGroups.length > 0 && (...)}
`, { label: 'dashboard-correlation', phase: 'Frontend' }),

  // ── Agent D: Routing (Shared.js, app.js, index.html) ──────────────────────
  () => agent(`You are working on a NSE trade surveillance frontend (React 18 via CDN + Babel Standalone).

THREE FILES TO MODIFY:
1. C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\frontend\\js\\components\\Shared.js
2. C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\frontend\\js\\app.js
3. C:\\Users\\mayan\\OneDrive\\Desktop\\Hackerthon\\trade-surveillance\\frontend\\index.html

Read all 3 files first, then make these changes:

CHANGE 1 — Shared.js: Update useRoute to support trader profile URLs
Current useRoute function parses: /, /alerts, /alert/:id, /trades, /logs, /settings
Add support for: /trader/:id

Current return: return { page, alertId, nav };
After adding trader route: return { page, alertId, traderId, nav };

In the route parsing block, add:
  let traderId = null;
  // (add this next to the alertId variable declaration)
  
  And add this route condition (alongside the other else-if chains):
  else if (raw.startsWith('/trader/')) { page = 'trader-profile'; traderId = raw.slice(8); }

Update the return to: return { page, alertId, traderId, nav };

CHANGE 2 — app.js: Render TraderProfilePage for the new route
Current app.js has this routing block (find it and update it):
  const { page, alertId, nav } = window.useRoute();
  
Change to:
  const { page, alertId, traderId, nav } = window.useRoute();

In the page content section, the current routing block is:
  {page === 'dashboard'    && <window.Dashboard ... />}
  {page === 'alerts'       && <window.AlertsPage nav={nav} />}
  {page === 'alert-detail' && alertId && <window.AlertDetailPage alertId={alertId} nav={nav} />}
  {page === 'trades'       && <window.TradesPage />}
  {page === 'logs'         && <window.LogsPage nav={nav} />}
  {page === 'settings'     && <window.SettingsPage />}

Add a new line AFTER the alert-detail line:
  {page === 'trader-profile' && traderId && <window.TraderProfilePage traderId={traderId} nav={nav} />}

CHANGE 3 — index.html: Add TraderProfile.js script tag
The current script tags at the bottom of <body> load files in this order:
  api.js → Shared.js → Header.js → Sidebar.js → StatsBar.js → Charts.js → TopSuspects.js →
  Dashboard.js → Alerts.js → AlertDetail.js → Trades.js → Logs.js → Settings.js → app.js

Add a new line:
  <script type="text/babel" src="js/pages/TraderProfile.js"></script>
Place it AFTER Settings.js and BEFORE app.js (so it loads before the root App component).

IMPORTANT RULES:
- Only make the 3 specific changes described above — do NOT modify anything else
- Preserve all existing code exactly as-is
- In Shared.js: only add traderId variable + one else-if + update return
- In app.js: only update destructuring + add one JSX line
- In index.html: only add one script tag
- Read each file before editing
`, { label: 'routing-update', phase: 'Frontend' }),

])

return { status: 'done', message: 'All 5 features built: STR generator, timeline chart, trader profile, market impact, correlation panel' }
