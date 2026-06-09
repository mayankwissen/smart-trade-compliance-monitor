const { useState: _aduseS, useEffect: _aduseE, useCallback: _aduseC } = React;

function _AlertTimelineChart({ trades }) {
  const t = window.useT();
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);
  React.useEffect(() => {
    if (!canvasRef.current || !trades || !trades.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const ctx = canvasRef.current.getContext('2d');
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

window.AlertDetailPage = function AlertDetailPage({ alertId, nav }) {
  const t = window.useT();
  const [data, setData]             = _aduseS(null);
  const [loading, setLoading]       = _aduseS(true);
  const [triaging, setTriaging]     = _aduseS(false);
  const [tab, setTab]               = _aduseS('triage');
  const [barW, setBarW]             = _aduseS(0);

  // Analyst feedback state
  const [feedbackSent, setFeedbackSent]       = _aduseS(false);
  const [feedbackLoading, setFeedbackLoading] = _aduseS(false);
  const [feedbackResult, setFeedbackResult]   = _aduseS(null);
  const [selectedReason, setSelectedReason]   = _aduseS('');
  const [customReason, setCustomReason]       = _aduseS('');

  // Deep dive state
  const [deepDive, setDeepDive]         = _aduseS(null);
  const [deepLoading, setDeepLoading]   = _aduseS(false);
  const [deepError, setDeepError]       = _aduseS(null);

  // XAI Truth Anchors state
  const [xaiOpen, setXaiOpen]           = _aduseS(false);
  const [xaiData, setXaiData]           = _aduseS(null);
  const [xaiLoading, setXaiLoading]     = _aduseS(false);

  // Crime Scene Replay state — MUST be at top level, never inside conditional
  const [playing, setPlaying]         = _aduseS(false);
  const [currentStep, setCurrentStep] = _aduseS(-1);
  const [replaySpeed, setReplaySpeed] = _aduseS(1);
  const [crimeLog, setCrimeLog]       = _aduseS([]);
  const intervalRef                   = React.useRef(null);

  const load = _aduseC(async () => {
    try {
      const d = await fetch(`${window.API_BASE}/api/alert/${alertId}/full`).then(r => r.json());
      setData(d);
      if (d.triage) setTimeout(() => setBarW(d.triage.confidence || 0), 100);
    } catch {}
    setLoading(false);
  }, [alertId]);

  _aduseE(() => {
    setLoading(true); setBarW(0); setTab('triage');
    setFeedbackSent(false); setFeedbackResult(null);
    setSelectedReason(''); setCustomReason('');
    setDeepDive(null); setDeepError(null);
    load();
  }, [load]);

  // Cleanup replay interval on unmount
  _aduseE(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const stopPlay = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setPlaying(false);
  };
  const resetPlay = () => { stopPlay(); setCurrentStep(-1); setCrimeLog([]); };
  const startPlay = (tradesToPlay) => {
    if (!tradesToPlay || tradesToPlay.length === 0) return;
    setCurrentStep(0); setCrimeLog([]); setPlaying(true);
    let step = 0;
    intervalRef.current = setInterval(() => {
      step += 1;
      if (step >= tradesToPlay.length) {
        clearInterval(intervalRef.current); intervalRef.current = null;
        setPlaying(false); return;
      }
      setCurrentStep(step);
      const tr = tradesToPlay[step];
      const ts = (tr.timestamp || '').slice(11, 19);
      if (tr.order_status === 'CANCELLED') {
        setCrimeLog(l => [...l, { ts, msg: `ORDER CANCELLED after ${tr.cancel_time_ms}ms — ${tr.cancel_time_ms < 600 ? '⚠ SUSPICIOUS' : 'normal'}`, color: '#ef4444' }]);
      } else if (tr.order_type === 'BUY') {
        setCrimeLog(l => [...l, { ts, msg: `BUY order placed: ${tr.order_size?.toLocaleString()} shares @ ₹${parseFloat(tr.price).toFixed(2)}`, color: '#22c55e' }]);
      } else {
        setCrimeLog(l => [...l, { ts, msg: `SELL executed: ${tr.order_size?.toLocaleString()} shares @ ₹${parseFloat(tr.price).toFixed(2)}`, color: '#f59e0b' }]);
      }
    }, Math.round(1000 / replaySpeed));
  };

  const doTriage = async () => {
    setTriaging(true);
    try { await fetch(`${window.API_BASE}/api/triage/${alertId}`, { method: 'POST' }); await load(); }
    catch {}
    setTriaging(false);
  };

  const doFeedback = async (analystVerdict) => {
    const reason = (selectedReason + (customReason ? ' — ' + customReason : '')).trim();
    if (!reason) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch(`${window.API_BASE}/api/feedback/${alertId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analyst_verdict: analystVerdict, reason }),
      }).then(r => r.json());
      setFeedbackResult(res);
      setFeedbackSent(true);
      await load();
    } catch {}
    setFeedbackLoading(false);
  };

  const doDeepDive = async () => {
    setDeepLoading(true);
    setDeepError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 38000);
    try {
      const res = await fetch(`${window.API_BASE}/api/deep-investigation/${alertId}`, { signal: controller.signal }).then(r => r.json());
      if (res.error) { setDeepError(String(res.error)); }
      else if (res.investigation) { setDeepDive(res.investigation); }
      else { setDeepError('No investigation data returned — retry'); }
    } catch (e) {
      setDeepError(e.name === 'AbortError' ? 'Analysis timed out (>35s) — retry' : 'Network error — retry');
    } finally {
      clearTimeout(timeout);
      setDeepLoading(false);
    }
  };

  const doVerifyEvidence = async () => {
    if (xaiData) { setXaiOpen(v => !v); return; }
    setXaiLoading(true);
    try {
      const res = await fetch(`${window.API_BASE}/api/verify-evidence/${alertId}`).then(r => r.json());
      if (!res.error) setXaiData(res);
    } catch {}
    setXaiLoading(false);
    setXaiOpen(true);
  };

  if (loading) return (
    <div className="page-scroll" style={{ background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <window.Spinner />
    </div>
  );
  if (!data || !data.alert) return (
    <div className="page-scroll" style={{ background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted }}>
      Alert not found
    </div>
  );

  const { alert, triage, escalations, trades } = data;
  const verdict = triage?.verdict;
  const vc = verdict === 'ESCALATE' ? t.danger : verdict === 'DISMISS' ? t.success : t.gold;
  const caseEsc  = escalations?.find(e => e.action_type === 'CASE_CREATED');
  const slackEsc = escalations?.find(e => e.action_type === 'SLACK_NOTIFIED');
  const watchEsc = escalations?.find(e => e.action_type === 'WATCHLIST_FLAGGED');
  const emailEsc = escalations?.find(e => e.action_type === 'EMAIL_SENT');
  let caseId = null;
  try { if (caseEsc) caseId = JSON.parse(caseEsc.payload).case_id; } catch {}

  const inputTok = 280, outputTok = 200;
  const cost = ((inputTok * 3 + outputTok * 15) / 1e6).toFixed(6);
  const realInput = triage?.input_tokens || inputTok;
  const realOutput = triage?.output_tokens || outputTok;
  const realCost = ((realInput * 3 + realOutput * 15) / 1e6).toFixed(6);

  const riskColor = {
    CRITICAL: t.danger,
    HIGH:     '#ef4444',
    MEDIUM:   t.warning,
    LOW:      t.success,
  };

  return (
    <div className="page-scroll" style={{ background: t.bg }}>
      {/* Back breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => nav('/alerts')}
          style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.textSec, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 12 }}>
          ← Back
        </button>
        <span style={{ color: t.textMuted, fontSize: 14 }}>Alert Detail</span>
        <span style={{ color: t.gold, fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700 }}>{alert.alert_id}</span>
      </div>

      {/* Alert overview grid */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, color: t.textMuted, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>Alert Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            ['Alert ID',    <span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700 }}>{alert.alert_id}</span>],
            ['Pattern',     <window.Bdg label={alert.pattern_type} cfg={window.PAT_CFG[alert.pattern_type]} />],
            ['Trader ID',   <span onClick={() => nav('/trader/' + alert.trader_id)} style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }} title="View trader profile">{alert.trader_id}</span>],
            ['Instrument',  <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, color: t.text, fontSize: 16 }}>{alert.instrument}</span>],
            ['Severity',    <window.Bdg label={alert.severity} cfg={window.SEV_CFG[alert.severity]} lg />],
            ['Status',      <window.Bdg label={alert.status}   cfg={window.STA_CFG[alert.status]} />],
            ['Detected At', <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted }}>{window.fmtDate(alert.detected_at)}</span>],
            ['Session',     <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textSec }}>{(trades && trades[0] && trades[0].session_id) || alert.session_id || '—'}</span>],
          ].map(([k, v], i) => (
            <div key={i} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.1em', marginBottom: 5, textTransform: 'uppercase' }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>
      </window.Card>

      {/* Tabs */}
      <window.Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, background: t.bg }}>
          {[
            ['triage',    'AI Triage'],
            ['evidence',  'Evidence'],
            ['actions',   'Escalations'],
            ['timeline',  'Timeline'],
            ['deepdive',  'Deep Dive'],
          ].map(([k, label]) => (
            <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        <div className="tab-content">

          {/* ── TAB 1: AI TRIAGE ── */}
          {tab === 'triage' && (
            <div>
              {!triage && !triaging && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 60, height: 60, borderRadius: '50%',
                    border: `1px solid ${t.gold}44`, background: `${t.gold}08`, marginBottom: 20,
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 18, color: t.text, marginBottom: 8 }}>
                    Ready for AI Triage
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.6 }}>
                    Claude Sonnet will act as NSE Chief Compliance Officer and return a SEBI-grade verdict with regulatory citations.
                  </div>
                  <window.Btn onClick={doTriage} style={{ fontSize: 13, padding: '10px 32px' }}>Run AI Triage</window.Btn>
                  <div style={{ color: t.textMuted, fontSize: 11, marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                    ~{inputTok + outputTok} tokens · ~${cost} · ~3s
                  </div>
                </div>
              )}

              {triaging && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 60, height: 60, borderRadius: '50%',
                    border: `2px solid ${t.gold}`, background: `${t.gold}0a`,
                    marginBottom: 24, animation: 'pulse-dot 1.8s ease-in-out infinite',
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 20, color: t.gold, marginBottom: 6 }}>
                    Analyzing Alert
                  </div>
                  <div style={{ color: t.textSec, fontSize: 13, marginBottom: 4 }}>
                    NSE Chief Compliance Officer · Claude Sonnet
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 12, marginBottom: 24, fontFamily: "'JetBrains Mono',monospace" }}>
                    {alert.pattern_type.replace(/_/g, ' ')} · SEBI PFUTP Review
                  </div>
                  <div style={{ display: 'inline-block', background: t.card, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px 24px' }}>
                    <div style={{ color: '#525252', fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
                      claude-sonnet-4-6 · ~280 tokens · ~$0.00014
                    </div>
                  </div>
                </div>
              )}

              {triage && !triaging && (
                <div>
                  {/* ── Verdict block ── */}
                  <div style={{ background: t.bg, border: `1px solid ${vc}44`, borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.15em', marginBottom: 12 }}>AI VERDICT · CLAUDE SONNET · CHIEF COMPLIANCE OFFICER</div>
                    <div className="scale-in glow-text"
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 52, fontWeight: 700, color: vc, letterSpacing: '.06em', marginBottom: 16 }}>
                      {verdict}
                    </div>
                    {/* Confidence bar */}
                    <div style={{ background: t.border, borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', background: vc, borderRadius: 4, width: `${barW}%`, transition: 'width .8s cubic-bezier(.4,0,.2,1)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: "'Inter',sans-serif", color: t.textMuted, marginBottom: 12 }}>
                      <span>CONFIDENCE: <strong style={{ color: t.text }}>{triage.confidence}%</strong></span>
                      <span>FALSE POSITIVE: <strong style={{ color: t.text }}>{triage.false_positive_probability}%</strong></span>
                    </div>
                    {triage.risk_level && (
                      <window.Bdg
                        label={`RISK: ${triage.risk_level}`}
                        cfg={{ bg: (riskColor[triage.risk_level] || vc) + '22', c: riskColor[triage.risk_level] || vc }}
                        lg />
                    )}
                  </div>

                  {/* ── DISMISS: FALSE POSITIVE SUPPRESSED block ── */}
                  {verdict === 'DISMISS' && (
                    <div style={{ background: '#22c55e08', border: '1px solid #22c55e44', borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: '0 0 18px #22c55e18' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <span style={{ background: '#22c55e22', color: '#22c55e', borderRadius: 6, padding: '4px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', fontFamily: "'Inter',sans-serif" }}>
                          FALSE POSITIVE SUPPRESSED
                        </span>
                        <span style={{ fontSize: 11, color: '#22c55e', fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>
                          No escalation triggered · Analyst time saved: ~25 minutes
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: '#22c55e99', marginBottom: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                        Why this was dismissed
                      </div>
                      <div style={{ color: '#a0e4b0', fontSize: 13, lineHeight: 1.8, fontFamily: "'Inter',sans-serif", marginBottom: 14 }}>
                        {triage.rationale}
                      </div>
                      <div style={{ background: '#0a1f0e', borderRadius: 6, padding: '12px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#6ee7a0', lineHeight: 2 }}>
                        <span style={{ color: '#22c55e99' }}>cancel_ratio: </span>
                        <span style={{ fontWeight: 700 }}>{((alert.cancel_ratio || 0) * 100).toFixed(1)}%</span>
                        <span style={{ color: '#22c55e99' }}> (threshold: 70%+) · sigma: </span>
                        <span style={{ fontWeight: 700 }}>{alert.sigma}σ</span>
                        <span style={{ color: '#22c55e99' }}> (suspicious: &gt;8.0σ) · verdict: </span>
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>DISMISS</span>
                      </div>
                      <div style={{ marginTop: 14, padding: '10px 14px', background: '#22c55e0a', borderRadius: 6, border: '1px solid #22c55e22' }}>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: '#22c55e', fontWeight: 700, letterSpacing: '.1em', marginBottom: 4 }}>NO ESCALATION ACTIONS TRIGGERED</div>
                        <div style={{ fontSize: 12, color: '#22c55e88', fontFamily: "'Inter',sans-serif" }}>
                          No case file · No Slack alert · No watchlist flag · No STR filing — statistical false positive correctly identified
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── AI TRIAGE NARRATIVE ── */}
                  <div style={{ background: t.bg, border: `1px solid ${t.gold}44`, borderRadius: 10, padding: 20, marginBottom: 16, display: verdict === 'DISMISS' ? 'none' : 'block' }}>
                    <div style={{ fontSize: 10, color: t.gold, fontWeight: 700, letterSpacing: '.15em', marginBottom: 14, fontFamily: "'Inter',sans-serif" }}>AI TRIAGE NARRATIVE</div>
                    {triage.rationale && (
                      <div style={{ color: t.textSec, fontSize: 13, lineHeight: 1.8, marginBottom: 16, fontFamily: "'Inter',sans-serif", fontStyle: 'italic' }}>
                        {triage.rationale}
                      </div>
                    )}
                    <div style={{ background: '#000', borderRadius: 6, padding: '14px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textSec, lineHeight: 2 }}>
                      <span style={{ color: t.textMuted }}>Cancellation ratio: </span>
                      <span style={{ color: t.warning, fontWeight: 700 }}>{((alert.cancel_ratio || 0) * 100).toFixed(1)}%</span>
                      <span style={{ color: t.textMuted }}> | Time-to-cancel median: </span>
                      <span style={{ color: t.info, fontWeight: 700 }}>&lt;600ms</span>
                      <span style={{ color: t.textMuted }}> | Anomaly vs baseline: </span>
                      <span style={{ color: t.danger, fontWeight: 700 }}>+{alert.sigma}σ</span>
                      <br />
                      <span style={{ color: t.textMuted }}>Verdict: </span>
                      <span style={{ color: vc, fontWeight: 700 }}>{verdict}</span>
                      <span style={{ color: t.textMuted }}> | Confidence: </span>
                      <span style={{ color: t.success, fontWeight: 700 }}>{triage.confidence}%</span>
                      <span style={{ color: t.textMuted }}> | FP Probability: </span>
                      <span style={{ color: t.warning, fontWeight: 700 }}>{triage.false_positive_probability}%</span>
                    </div>
                  </div>

                  {/* ── IN PLAIN TERMS (blue border) ── */}
                  {triage.simple_explanation && (
                    <div style={{ background: t.bg, border: `1px solid ${t.info}44`, borderLeft: `3px solid ${t.info}`, borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: t.info, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.12em', marginBottom: 6 }}>IN PLAIN TERMS</div>
                      <div style={{ color: t.text, fontSize: 13, lineHeight: 1.7 }}>{triage.simple_explanation}</div>
                    </div>
                  )}

                  {/* ── RECOMMENDED ACTION (amber border) ── */}
                  {triage.recommended_action && (
                    <div style={{ background: t.bg, border: `1px solid ${t.warning}44`, borderLeft: `3px solid ${t.warning}`, borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: t.warning, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.12em', marginBottom: 6 }}>RECOMMENDED ACTION</div>
                      <div style={{ color: t.text, fontSize: 13, lineHeight: 1.6 }}>{triage.recommended_action}</div>
                    </div>
                  )}

                  {/* ── REGULATORY REFERENCE (purple border) ── */}
                  {triage.regulatory_reference && (
                    <div style={{ background: t.bg, border: '1px solid #a855f744', borderLeft: '3px solid #a855f7', borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: '#a855f7', fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.12em', marginBottom: 6 }}>REGULATORY REFERENCE</div>
                      <div style={{ color: t.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.6 }}>{triage.regulatory_reference}</div>
                    </div>
                  )}

                  {/* ── XAI TRUTH ANCHORS ── */}
                  <div style={{ marginBottom: 16 }}>
                    <button onClick={doVerifyEvidence}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: xaiOpen ? '#3b82f622' : 'transparent', border: `1px solid ${xaiOpen ? t.info : t.border}`, color: xaiOpen ? t.info : t.textSec, borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>
                      {xaiLoading ? '⏳ Verifying...' : xaiOpen ? '🔍 Hide Evidence Verification' : '🔍 Verify Evidence (XAI)'}
                    </button>

                    {xaiOpen && xaiData && (
                      <div style={{ marginTop: 10, background: t.bg, border: `1px solid ${t.info}33`, borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: 10, color: t.info, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.15em', marginBottom: 14, textTransform: 'uppercase' }}>Truth Anchor Panel — Mathematical Verification</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {(xaiData.claims || []).map((claim, i) => (
                            <div key={i} style={{ background: t.card, border: `1px solid ${claim.verified ? '#22c55e33' : '#ef444433'}`, borderLeft: `3px solid ${claim.verified ? '#22c55e' : '#ef4444'}`, borderRadius: 8, padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{ background: '#f59e0b22', color: '#f59e0b', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>CLAIM</span>
                                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, fontWeight: 700 }}>{claim.claim_text}</span>
                                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, fontFamily: "'Inter',sans-serif", color: claim.verified ? '#22c55e' : '#ef4444' }}>
                                  {claim.verified ? '✅ VERIFIED' : '❌ UNVERIFIED'}
                                </span>
                              </div>
                              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#3b82f6', marginBottom: 6 }}>
                                FORMULA: {claim.formula}
                              </div>
                              {typeof claim.calculated_value === 'number' && (
                                <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: "'JetBrains Mono',monospace', color: t.textMuted" }}>
                                  <span style={{ color: t.textMuted }}>Calculated: <span style={{ color: t.text, fontWeight: 700 }}>{typeof claim.calculated_value === 'number' ? claim.calculated_value.toFixed(4) : claim.calculated_value}</span></span>
                                  <span style={{ color: t.textMuted }}>Claude stated: <span style={{ color: t.text, fontWeight: 700 }}>{typeof claim.claude_stated_value === 'number' ? claim.claude_stated_value.toFixed(4) : claim.claude_stated_value}</span></span>
                                  <span style={{ color: t.textMuted }}>Deviation: <span style={{ color: claim.deviation < 0.05 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{typeof claim.deviation === 'number' ? claim.deviation.toFixed(4) : '0'}</span></span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 14, padding: '12px 16px', background: xaiData.all_verified ? '#22c55e0a' : '#ef44440a', border: `1px solid ${xaiData.all_verified ? '#22c55e44' : '#ef444444'}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, color: xaiData.all_verified ? '#22c55e' : '#ef4444', marginBottom: 2 }}>
                              {xaiData.hallucination_score === 0 ? '0 unverified claims detected' : `${xaiData.hallucination_score} unverified claim(s)`}
                            </div>
                            <div style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                              {xaiData.verification_rate}% of statistical claims verified · {xaiData.total_trades_analyzed} trades analyzed
                            </div>
                          </div>
                          <window.Bdg
                            label={xaiData.all_verified ? 'AI VERDICT MATHEMATICALLY VERIFIED' : 'VERIFICATION INCOMPLETE'}
                            cfg={xaiData.all_verified ? { bg: '#22c55e22', c: '#22c55e' } : { bg: '#ef444422', c: '#ef4444' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── AI METRICS ── */}
                  <div style={{ background: t.bg, border: `1px solid ${t.gold}33`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 10, color: t.gold, letterSpacing: '.15em', marginBottom: 12 }}>AI METRICS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                      {[
                        ['Model',          'claude-sonnet-4-6'],
                        ['Input Tokens',   realInput.toString()],
                        ['Output Tokens',  realOutput.toString()],
                        ['Total Tokens',   (realInput + realOutput).toString()],
                        ['Processing',     `${triage.processing_time_ms || 2400}ms`],
                        ['Est. Cost',      `$${realCost}`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ padding: '8px 12px', background: t.card, borderRadius: 6, border: `1px solid ${t.border}` }}>
                          <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em' }}>{k}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: t.gold, fontSize: 13, marginTop: 3 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── ANALYST REVIEW ── */}
                  {!feedbackSent && (() => {
                    const isDismiss = verdict === 'DISMISS';
                    const borderC  = isDismiss ? '#f59e0b' : '#22c55e';
                    const bgC      = isDismiss ? '#fffbeb' : '#f0fdf4';
                    const titleC   = isDismiss ? '#92400e' : '#065f46';
                    const question = isDismiss
                      ? 'Do you disagree with this DISMISS verdict?'
                      : 'Do you believe this is a false positive?';
                    const targetVerdict = isDismiss ? 'ESCALATE' : 'DISMISS';
                    const btnLabel  = isDismiss ? 'Override to ESCALATE' : 'Override to DISMISS';
                    const btnColor  = isDismiss ? '#ef4444' : '#22c55e';
                    const reasons   = isDismiss
                      ? ['Market context not captured', 'Repeat offender pattern', 'Related to other suspicious activity']
                      : ['Legitimate market maker', 'Algorithmic order management', 'News/corporate event driven'];
                    return (
                      <div style={{ border: `1px solid ${borderC}44`, borderLeft: `3px solid ${borderC}`, borderRadius: '0 8px 8px 0', padding: 16, marginBottom: 16, background: bgC + '66' }}>
                        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, color: titleC, marginBottom: 12 }}>
                          ANALYST REVIEW — {question}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                          {reasons.map(r => (
                            <button key={r} onClick={() => setSelectedReason(selectedReason === r ? '' : r)}
                              style={{
                                background: selectedReason === r ? borderC + '22' : t.bg,
                                border: `1px solid ${selectedReason === r ? borderC : t.border}`,
                                color: selectedReason === r ? titleC : t.textSec,
                                borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: selectedReason === r ? 700 : 400,
                                cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                              }}>{r}</button>
                          ))}
                        </div>
                        <textarea
                          value={customReason}
                          onChange={e => setCustomReason(e.target.value)}
                          placeholder="Additional details (optional)..."
                          style={{
                            width: '100%', minHeight: 60, resize: 'vertical', marginBottom: 10,
                            background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6,
                            color: t.text, fontFamily: "'Inter',sans-serif", fontSize: 12, padding: '8px 10px',
                          }}
                        />
                        <button
                          onClick={() => doFeedback(targetVerdict)}
                          disabled={feedbackLoading || (!selectedReason && !customReason)}
                          style={{
                            background: (!selectedReason && !customReason) ? t.border : btnColor,
                            color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px',
                            fontSize: 12, fontWeight: 700, cursor: feedbackLoading || (!selectedReason && !customReason) ? 'default' : 'pointer',
                            fontFamily: "'Inter',sans-serif",
                          }}>
                          {feedbackLoading ? 'Sending to Claude...' : btnLabel}
                        </button>
                      </div>
                    );
                  })()}

                  {/* ── CLAUDE RECONSIDERATION RESULT ── */}
                  {feedbackSent && feedbackResult && (
                    <div style={{ border: `1px solid ${t.warning}44`, borderRadius: 8, padding: 16, marginBottom: 16, background: t.bg }}>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, color: t.warning, letterSpacing: '.12em', marginBottom: 12 }}>
                        CLAUDE AI RECONSIDERATION
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", marginBottom: 3 }}>ORIGINAL</div>
                          <span style={{
                            background: feedbackResult.original_verdict === 'ESCALATE' ? '#ef444422' : '#22c55e22',
                            color: feedbackResult.original_verdict === 'ESCALATE' ? '#ef4444' : '#22c55e',
                            borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                          }}>{feedbackResult.original_verdict || '—'}</span>
                        </div>
                        <span style={{ color: t.textMuted, fontSize: 16 }}>→</span>
                        <div>
                          <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", marginBottom: 3 }}>RECONSIDERED</div>
                          <span style={{
                            background: (feedbackResult.reconsidered?.verdict) === 'ESCALATE' ? '#ef444422' : '#22c55e22',
                            color: (feedbackResult.reconsidered?.verdict) === 'ESCALATE' ? '#ef4444' : '#22c55e',
                            borderRadius: 4, padding: '4px 10px', fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                          }}>{feedbackResult.reconsidered?.verdict || '—'}</span>
                        </div>
                      </div>
                      {feedbackResult.reconsidered?.reconsideration_reason && (
                        <div style={{ color: t.textSec, fontSize: 12, lineHeight: 1.7, fontStyle: 'italic', marginBottom: 10 }}>
                          "{feedbackResult.reconsidered.reconsideration_reason}"
                        </div>
                      )}
                      <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 600,
                        background: feedbackResult.verdict_changed ? '#f59e0b18' : '#3b82f618',
                        color: feedbackResult.verdict_changed ? '#92400e' : '#1e40af',
                        border: `1px solid ${feedbackResult.verdict_changed ? '#f59e0b44' : '#3b82f644'}`,
                      }}>
                        {feedbackResult.verdict_changed
                          ? 'Claude updated verdict based on analyst feedback'
                          : 'Claude maintained original verdict with analyst feedback noted'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: EVIDENCE & TRADES ── */}
          {tab === 'evidence' && (
            <div>
              {/* Stats box */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  ['Cancel Ratio', `${((alert.cancel_ratio || 0) * 100).toFixed(1)}%`,                               t.warning],
                  ['Sigma',         `${alert.sigma}σ`,                                                                t.danger],
                  ['Total Orders',  trades?.length || 0,                                                              t.info],
                  ['Total Volume',  window.fmtK(trades?.reduce((s, r) => s + (r.order_size || 0), 0) || 0),          t.success],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 22, color: c }}>{v}</div>
                    <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em', marginTop: 4 }}>{k}</div>
                  </div>
                ))}
              </div>

              {/* Trades table */}
              <div className="dt-wrap" style={{ overflowX: 'auto' }}>
                <table className="dt">
                  <thead>
                    <tr>{['TIME', 'TYPE', 'SIZE', 'PRICE', 'STATUS', 'CANCEL MS', 'FLAG'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(!trades || trades.length === 0) && (
                      <tr><td colSpan={7}><window.EmptyState msg="No trades found for this alert" /></td></tr>
                    )}
                    {(trades || []).map((tr, i) => {
                      const isCan = tr.order_status === 'CANCELLED';
                      const isExe = tr.order_status === 'EXECUTED';
                      return (
                        <tr key={i} style={{
                          background: tr.is_suspicious ? t.danger + '0a'
                            : isCan ? '#ef444408'
                            : isExe ? '#22c55e08'
                            : 'transparent',
                        }}>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textSec }}>{tr.timestamp}</span></td>
                          <td><span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: tr.order_type === 'BUY' ? t.success : t.danger }}>{tr.order_type}</span></td>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.text }}>{window.fmtNum(tr.order_size)}</span></td>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontWeight: 700 }}>{window.fmtRs(tr.price)}</span></td>
                          <td>
                            <window.Bdg label={tr.order_status}
                              cfg={isExe  ? { bg: '#22c55e22', c: '#22c55e' }
                                 : isCan  ? { bg: '#ef444422', c: '#ef4444' }
                                 :           { bg: '#2a2a2a',   c: '#a0a0a0' }} />
                          </td>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: tr.cancel_time_ms > 0 && tr.cancel_time_ms < 600 ? t.danger : t.textSec }}>{tr.cancel_time_ms || '—'}</span></td>
                          <td>{tr.is_suspicious && <span style={{ display: 'inline-block', background: '#ef444418', color: '#ef4444', borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '.05em', fontFamily: "'Inter',sans-serif" }}>FLAG</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB 4: TIMELINE (Crime Scene Replay) ── */}
          {tab === 'timeline' && (() => {
            const displayTrades = trades || [];
            const maxSize = Math.max(...displayTrades.map(tr => tr.order_size || 0), 1);
            const totalCancelled = displayTrades.filter(tr => tr.order_status === 'CANCELLED').length;
            const fastCancel = displayTrades.filter(tr => tr.order_status === 'CANCELLED' && tr.cancel_time_ms > 0 && tr.cancel_time_ms < 600).length;
            const prices = displayTrades.map(tr => parseFloat(tr.price) || 0).filter(p => p > 0);
            const priceMove = prices.length > 1 ? ((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices) * 100).toFixed(2) : '0.00';
            const totalValue = displayTrades.reduce((s, tr) => s + (tr.order_size || 0) * (parseFloat(tr.price) || 0), 0);
            return (
              <div>
                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text, marginRight: 4 }}>Crime Scene Replay</span>
                  <button onClick={playing ? stopPlay : () => startPlay(displayTrades)}
                    style={{ background: playing ? '#ef4444' : t.gold, color: '#000', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                    {playing ? '⏸ Pause' : '▶ Play Investigation'}
                  </button>
                  <button onClick={resetPlay}
                    style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.textSec, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                    ⏮ Reset
                  </button>
                  <span style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif", marginLeft: 4 }}>Speed:</span>
                  {[0.5, 1, 2, 3].map(s => (
                    <button key={s} onClick={() => setReplaySpeed(s)}
                      style={{ background: replaySpeed === s ? t.gold + '22' : 'transparent', border: `1px solid ${replaySpeed === s ? t.gold : t.border}`, color: replaySpeed === s ? t.gold : t.textSec, borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace" }}>
                      {s}x
                    </button>
                  ))}
                  {currentStep >= 0 && (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted, marginLeft: 4 }}>
                      {currentStep + 1}/{displayTrades.length}
                    </span>
                  )}
                </div>

                {/* Animated bar chart */}
                <div style={{ background: '#0a0f1c', border: `1px solid ${t.border}`, borderRadius: 8, padding: '16px 12px', marginBottom: 14, minHeight: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, overflowX: 'auto' }}>
                    {displayTrades.map((tr, i) => {
                      const pct = Math.max(8, ((tr.order_size || 0) / maxSize) * 120);
                      const isActive = i <= currentStep;
                      const isCurrent = i === currentStep;
                      const isCan = tr.order_status === 'CANCELLED';
                      let barColor = isCan ? '#f59e0b' : tr.order_type === 'BUY' ? '#22c55e' : '#ef4444';
                      if (isCan && isActive && !isCurrent) barColor = '#374151';
                      const opacity = currentStep === -1 ? 1 : isActive ? 1 : 0.25;
                      return (
                        <div key={i} title={`${tr.order_type} ${tr.order_status} ${tr.order_size} @ ₹${parseFloat(tr.price).toFixed(2)}`}
                          style={{
                            width: Math.max(8, Math.min(22, Math.floor(700 / displayTrades.length))),
                            height: pct,
                            background: barColor,
                            flexShrink: 0,
                            borderRadius: '3px 3px 0 0',
                            opacity,
                            transition: 'opacity .3s, background .3s',
                            boxShadow: isCurrent ? `0 0 12px ${barColor}` : 'none',
                            animation: isCurrent && isCan ? 'shake-bar .3s ease' : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Crime Timeline log */}
                <div style={{ background: '#0a0f1c', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, minHeight: 80, maxHeight: 160, overflowY: 'auto' }}>
                  <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.1em', marginBottom: 8, textTransform: 'uppercase' }}>Crime Timeline</div>
                  {crimeLog.length === 0 && (
                    <div style={{ color: '#525252', fontSize: 12, fontFamily: "'Inter',sans-serif" }}>Press ▶ Play to start animated replay...</div>
                  )}
                  {crimeLog.map((entry, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", marginBottom: 3 }}>
                      <span style={{ color: '#525252', flexShrink: 0 }}>{entry.ts}</span>
                      <span style={{ color: entry.color }}>{entry.msg}</span>
                    </div>
                  ))}
                </div>

                {/* Investigation summary */}
                <div style={{ background: t.bg, border: `1px solid ${t.gold}44`, borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: t.gold, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.15em', marginBottom: 12, textTransform: 'uppercase' }}>Investigation Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                    {[
                      ['Total Orders',        displayTrades.length,                       t.text],
                      ['Cancelled Orders',    totalCancelled,                              t.warning],
                      ['Fast Cancels <600ms', fastCancel,                                  fastCancel > 0 ? t.danger : t.success],
                      ['Price Impact',        `+${priceMove}%`,                            t.info],
                      ['Total Value',         `₹${(totalValue/1e7).toFixed(2)}Cr`,         t.gold],
                      ['SEBI Violation',      'Reg 4(2)(a)',                               '#a855f7'],
                    ].map(([k, v, c]) => (
                      <div key={k} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 6, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em', marginBottom: 3 }}>{k}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: c, fontSize: 14 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ color: t.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginTop: 10, textAlign: 'center' }}>
                  Each bar = one order · Green = BUY · Red = SELL · Amber = CANCELLED · Glowing bar = current step
                </div>
              </div>
            );
          })()}

          {/* ── TAB 3: ESCALATION ACTIONS ── */}
          {tab === 'actions' && (
            <div>
              {!triage && <window.EmptyState msg="Run triage first to trigger escalation workflows" />}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>

                {/* Case file */}
                <window.Card style={{ borderLeft: `3px solid ${t.success}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.success, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Compliance Case</span>
                    <window.Bdg label={caseId ? 'CREATED' : 'PENDING'} cfg={caseId ? { bg: '#22c55e22', c: '#22c55e' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  {caseId ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {[
                          ['Case ID',     caseId],
                          ['Assigned To', 'Surveillance Desk L2'],
                          ['Status',      'OPEN'],
                          ['Created',     window.fmtTime(caseEsc?.created_at)],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif", textTransform: 'uppercase' }}>{k}</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, marginTop: 2 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => window.open(`${window.API_BASE}/api/export/case/${alertId}`)}
                          style={{
                            flex: 1, minWidth: 160,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            background: `${t.gold}18`, border: `1.5px solid ${t.gold}88`,
                            color: t.gold, borderRadius: 8, padding: '10px 18px',
                            cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                            fontWeight: 700, fontSize: 13, letterSpacing: '.02em',
                            transition: 'background .15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = `${t.gold}30`}
                          onMouseLeave={e => e.currentTarget.style.background = `${t.gold}18`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                          </svg>
                          Case Report (Print/PDF)
                        </button>
                        {triage && verdict === 'ESCALATE' && (
                          <button
                            onClick={() => window.open(window.API_BASE + '/api/generate-str/' + alertId)}
                            style={{
                              flex: 1, minWidth: 160,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              background: '#ef444418', border: '1.5px solid #ef444488',
                              color: '#ef4444', borderRadius: 8, padding: '10px 18px',
                              cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                              fontWeight: 700, fontSize: 13, letterSpacing: '.02em',
                              transition: 'background .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#ef444430'}
                            onMouseLeave={e => e.currentTarget.style.background = '#ef444418'}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                            </svg>
                            Generate STR Filing
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: t.textMuted, fontSize: 12 }}>No case yet — triage to trigger workflows.</div>
                  )}
                </window.Card>

                {/* Slack */}
                <window.Card style={{ borderLeft: `3px solid ${t.info}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.info, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Slack Notification</span>
                    <window.Bdg label={slackEsc ? 'SENT' : 'PENDING'} cfg={slackEsc ? { bg: '#3b82f622', c: '#3b82f6' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  {slackEsc ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['Channel',  '#compliance-alerts'],
                        ['Status',   'DELIVERED'],
                        ['Sent At',  window.fmtTime(slackEsc.created_at)],
                        ['Case Ref', caseId || '—'],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif" }}>{k}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: t.textMuted, fontSize: 12 }}>Slack notification sent on escalation.</div>}
                </window.Card>

                {/* Watchlist */}
                <window.Card style={{ borderLeft: `3px solid ${t.warning}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.warning, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Watchlist</span>
                    <window.Bdg label={watchEsc ? 'ACTIVE' : 'INACTIVE'} cfg={watchEsc ? { bg: '#f59e0b22', c: '#f59e0b' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  {watchEsc ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['Trader',   alert.trader_id],
                        ['Duration', '72 hours'],
                        ['Status',   'ACTIVE'],
                        ['Added',    window.fmtTime(watchEsc.created_at)],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif" }}>{k}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: t.textMuted, fontSize: 12 }}>Trader flagged to watchlist on escalation.</div>}
                </window.Card>

                {/* Email */}
                <window.Card style={{ borderLeft: '3px solid #a855f7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Email Alerts</span>
                    <window.Bdg label={emailEsc ? 'SENT' : '—'} cfg={emailEsc ? { bg: '#a855f722', c: '#a855f7' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  <div style={{ color: t.textSec, fontSize: 12 }}>
                    {emailEsc ? 'Compliance email sent to all active subscribers.' : 'Email notifications sent to subscribers on escalation.'}
                  </div>
                </window.Card>
              </div>
            </div>
          )}

          {/* ── TAB 5: DEEP DIVE ── */}
          {tab === 'deepdive' && (
            <div>
              {!deepDive && !deepLoading && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 17, color: t.text, marginBottom: 8 }}>
                    Forensic Deep Investigation
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 13, maxWidth: 460, margin: '0 auto 24px', lineHeight: 1.6 }}>
                    Claude produces an 8-section forensic report: manipulation mechanics, price impact, profit estimation,
                    behavioral fingerprint, evidence strength scores (1–10), and SEBI prosecution likelihood.
                  </div>
                  {deepError && (
                    <div style={{ color: t.danger, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, marginBottom: 14 }}>{deepError}</div>
                  )}
                  <window.Btn onClick={doDeepDive} style={{ fontSize: 13, padding: '10px 32px' }}>
                    Run Deep Investigation
                  </window.Btn>
                  <div style={{ color: t.textMuted, fontSize: 11, marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                    ~900 tokens · ~20–30s · concise 8-section report
                  </div>
                </div>
              )}

              {deepLoading && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 18, color: t.gold, marginBottom: 6, animation: 'pulse-dot 1.8s ease-in-out infinite' }}>
                    Conducting Forensic Analysis...
                  </div>
                  <div style={{ color: t.textSec, fontSize: 13, marginBottom: 8 }}>NSE Senior Investigator · Claude Sonnet · 8 sections</div>
                  <div style={{ color: t.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>Usually completes in 20–30s · times out at 35s</div>
                </div>
              )}

              {deepDive && !deepLoading && (() => {
                const sections = [
                  { key: 'manipulation_mechanics',        label: 'Manipulation Mechanics',         icon: '⚙' },
                  { key: 'price_impact_analysis',         label: 'Price Impact Analysis',           icon: '📈' },
                  { key: 'profit_estimation',             label: 'Profit Estimation',               icon: '₹' },
                  { key: 'behavioral_fingerprint',        label: 'Behavioral Fingerprint',          icon: '🔍' },
                  { key: 'similar_patterns',              label: 'Similar Patterns',                icon: '🔗' },
                  { key: 'evidence_strength',             label: 'Evidence Strength Scores',        icon: '⚖' },
                  { key: 'recommended_investigation_steps', label: 'Recommended Investigation Steps', icon: '📋' },
                  { key: 'sebi_prosecution_likelihood',   label: 'SEBI Prosecution Likelihood',     icon: '⚖' },
                ];
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>
                        Forensic Investigation Report
                      </span>
                      {deepDive.tokens_used && (
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted }}>
                          {deepDive.tokens_used} tokens used
                        </span>
                      )}
                      <button onClick={() => { setDeepDive(null); setDeepError(null); }}
                        style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                        Re-run
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {sections.map(({ key, label, icon }) => (
                        deepDive[key] ? (
                          <div key={key} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, color: t.gold, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{icon}</span>
                              <span style={{ letterSpacing: '.06em', textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
                            </div>
                            <div style={{ color: t.textSec, fontSize: 13, lineHeight: 1.8, fontFamily: "'Inter',sans-serif", whiteSpace: 'pre-wrap' }}>
                              {deepDive[key]}
                            </div>
                          </div>
                        ) : null
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </window.Card>
    </div>
  );
};
