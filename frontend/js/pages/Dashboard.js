const { useState: _duseS, useEffect: _duseE, useRef: _duseR } = React;

window.Dashboard = function Dashboard({ stats, alerts, escalations, nav, onRefreshComplete }) {
  const t = window.useT();
  const [page, setPage]           = _duseS(1);
  const [loadingSet, setLoadingSet] = _duseS(new Set());
  const [localAlerts, setLocalAlerts] = _duseS(alerts);
  const [refreshing, setRefreshing]   = _duseS(false);
  const [refreshStep, setRefreshStep] = _duseS('');
  const [demoRunning, setDemoRunning] = _duseS(false);
  const [demoStep, setDemoStep]       = _duseS('');
  const [resetting, setResetting]     = _duseS(false);
  const [tokenStats, setTokenStats]   = _duseS(null);

  // Chat widget state
  const [chatOpen, setChatOpen]       = _duseS(false);
  const [messages, setMessages]       = _duseS([
    { role: 'ai', text: "Hi! I'm your NSE surveillance assistant. I have access to all current alerts, trader profiles, and system data. Ask me anything about the ongoing surveillance session." }
  ]);
  const [inputVal, setInputVal]       = _duseS('');
  const [chatLoading, setChatLoading] = _duseS(false);
  const msgEndRef                     = _duseR(null);

  _duseE(() => setLocalAlerts(alerts), [alerts]);

  // Token usage bar — poll every 30s
  _duseE(() => {
    const fetchTok = async () => {
      try {
        const d = await fetch(`${window.API_BASE}/api/token-stats`).then(r => r.json());
        setTokenStats(d);
      } catch {}
    };
    fetchTok();
    const id = setInterval(fetchTok, 30000);
    return () => clearInterval(id);
  }, []);

  // Auto-populate on first visit — judges see live data immediately, no manual click needed
  _duseE(() => {
    if (localAlerts.length === 0) {
      (async () => {
        try {
          setRefreshing(true);
          setRefreshStep('Loading data...');
          await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' });
          setRefreshStep('Detecting patterns...');
          await fetch(`${window.API_BASE}/api/replay/start`, { method: 'POST' });
          setRefreshStep('');
          if (onRefreshComplete) await onRefreshComplete();
        } catch {}
        finally { setRefreshing(false); setRefreshStep(''); }
      })();
    }
  }, []); // mount-only

  const PER   = 10;
  const paged = localAlerts.slice((page - 1) * PER, page * PER);
  const pages = Math.ceil(localAlerts.length / PER) || 1;

  const doTriage = async id => {
    setLoadingSet(p => new Set([...p, id]));
    try {
      await fetch(`${window.API_BASE}/api/triage/${id}`, { method: 'POST' });
      const ar = await fetch(`${window.API_BASE}/api/alerts`).then(r => r.json());
      setLocalAlerts(ar.alerts || []);
    } catch {}
    finally { setLoadingSet(p => { const n = new Set(p); n.delete(id); return n; }); }
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      setRefreshStep('Refreshing data...');
      await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' });
      setRefreshStep('Detecting patterns...');
      await fetch(`${window.API_BASE}/api/replay/start`, { method: 'POST' });
      setRefreshStep('');
      if (onRefreshComplete) await onRefreshComplete();
    } catch { setRefreshStep('Backend unavailable — retry'); setTimeout(() => setRefreshStep(''), 3000); }
    finally { setRefreshing(false); }
  };

  // Demo Mode: refresh → detect → triage first HIGH alert
  const runDemoMode = async () => {
    setDemoRunning(true);
    try {
      setDemoStep('Fetching live prices...');
      await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' });
      await new Promise(r => setTimeout(r, 2000));

      setDemoStep('Detecting patterns...');
      await fetch(`${window.API_BASE}/api/replay/start`, { method: 'POST' });
      await new Promise(r => setTimeout(r, 2000));

      const res     = await fetch(`${window.API_BASE}/api/alerts`).then(r => r.json());
      const pending = (res.alerts || []).filter(a => a.severity === 'HIGH' && a.status === 'PENDING');

      if (pending.length > 0) {
        setDemoStep('Claude analyzing...');
        await fetch(`${window.API_BASE}/api/triage/${pending[0].alert_id}`, { method: 'POST' });
        await new Promise(r => setTimeout(r, 2000));
      }

      setDemoStep('Demo complete');
      if (onRefreshComplete) await onRefreshComplete();
      setTimeout(() => { setDemoRunning(false); setDemoStep(''); }, 3000);
    } catch {
      setDemoStep('❌ Error — retry');
      setDemoRunning(false);
    }
  };

  // Reset Demo: generate fresh trades + clear all alerts/triage/escalations
  const doReset = async () => {
    if (!window.confirm('Reset all data for fresh demo?')) return;
    setResetting(true);
    try {
      await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' });
      await fetch(`${window.API_BASE}/api/reset`, { method: 'POST' });
      if (onRefreshComplete) await onRefreshComplete();
    } catch {}
    finally { setResetting(false); }
  };

  const busy = refreshing || demoRunning || resetting;

  // Chat: auto-scroll to bottom when messages change
  _duseE(() => {
    if (msgEndRef.current) msgEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendChatMessage = async (text) => {
    const q = (text || inputVal).trim();
    if (!q || chatLoading) return;
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInputVal('');
    setChatLoading(true);
    try {
      const res  = await fetch(window.API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply || data.error || 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Sorry, I could not connect to the AI. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

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

  const renderMarkdown = (text) => {
    const inline = (s) => s
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f0b429;font-weight:700">$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:#1a1a1a;color:#f0b429;padding:1px 5px;border-radius:3px;font-size:11px;font-family:JetBrains Mono,monospace">$1</code>');
    return text.split('\n').map(raw => {
      const line = raw.trimEnd();
      if (!line) return '<div style="height:5px"></div>';
      if (/^#{1,3}\s/.test(line)) return '<div style="font-weight:700;color:#f0b429;font-size:12px;margin:5px 0 2px">' + inline(line.replace(/^#{1,3}\s+/, '')) + '</div>';
      if (/^[-•*]\s/.test(line)) return '<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#f0b429;flex-shrink:0">›</span><span>' + inline(line.replace(/^[-•*]\s+/, '')) + '</span></div>';
      const numMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (numMatch) return '<div style="display:flex;gap:6px;margin-bottom:3px"><span style="color:#f0b429;flex-shrink:0;font-family:JetBrains Mono,monospace;font-size:11px">' + numMatch[1] + '.</span><span>' + inline(numMatch[2]) + '</span></div>';
      return '<div>' + inline(line) + '</div>';
    }).join('');
  };

  const chatPortal = ReactDOM.createPortal(
    <>
      <style>{`
        @keyframes chatPulse {
          0%,100% { box-shadow: 0 4px 20px rgba(240,180,41,0.4); }
          50%      { box-shadow: 0 4px 32px rgba(240,180,41,0.7); }
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .chat-msg-scroll::-webkit-scrollbar { width: 4px; }
        .chat-msg-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-msg-scroll::-webkit-scrollbar-thumb { background: rgba(240,180,41,0.4); border-radius: 4px; }
        .chat-suggestion:hover { border-color: #f0b429 !important; color: #f0b429 !important; }
        .chat-input-field:focus { outline: none; border-color: #f0b429 !important; }
        @keyframes chatDot { 0%,80%,100%{opacity:.2;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
      `}</style>

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 160,
            width: 52, height: 52, borderRadius: '50%',
            background: '#f0b429', color: '#000', border: 'none',
            fontSize: 22, cursor: 'pointer', zIndex: 1000,
            animation: 'chatPulse 3s ease-in-out infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Ask AI Assistant"
        >💬</button>
      )}

      {chatOpen && (
        <div style={{
          position: 'fixed', bottom: 88, right: 160,
          width: 360, height: 480,
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: 16,
          boxShadow: '0 8px 48px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          zIndex: 1000,
          animation: 'chatSlideUp .22s ease-out both',
        }}>
          <div style={{
            height: 52, background: '#000',
            borderBottom: '1px solid #2a2a2a',
            borderRadius: '16px 16px 0 0',
            padding: '0 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🛡</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#f0b429', letterSpacing: '2px', fontWeight: 700 }}>AI ASSISTANT</span>
            </div>
            <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', color: '#525252', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>×</button>
          </div>

          <div className="chat-msg-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {['What patterns were detected?', 'Who is the top suspect?', 'How does layering work?', 'What actions were taken?'].map(q => (
                  <button key={q} className="chat-suggestion" onClick={() => sendChatMessage(q)}
                    style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 20, padding: '6px 14px', fontSize: 12, color: '#808080', cursor: 'pointer', transition: 'border-color .15s, color .15s', fontFamily: "'Inter',sans-serif" }}
                  >{q}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              m.role === 'ai'
                ? <div key={i} style={{
                    alignSelf: 'flex-start',
                    maxWidth: '90%',
                    background: '#0a0a0a',
                    border: '1px solid #2a2a2a',
                    color: '#e8e8e8',
                    borderRadius: '12px 12px 12px 4px',
                    padding: '10px 14px', fontSize: 13, lineHeight: 1.65,
                    fontFamily: "'Inter',sans-serif",
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
                />
                : <div key={i} style={{
                    alignSelf: 'flex-end',
                    maxWidth: '80%',
                    background: 'rgba(240,180,41,0.13)',
                    border: '1px solid rgba(240,180,41,0.27)',
                    color: '#e8e8e8',
                    borderRadius: '12px 12px 4px 12px',
                    padding: '10px 14px', fontSize: 13, lineHeight: 1.6,
                    fontFamily: "'Inter',sans-serif",
                  }}>{m.text}</div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: 'flex-start', background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '12px 12px 12px 4px', padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#f0b429', display: 'inline-block', animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          <div style={{ height: 56, borderTop: '1px solid #2a2a2a', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <input
              className="chat-input-field"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
              placeholder="Ask about alerts, traders, patterns..."
              style={{ flex: 1, background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 12px', color: '#e8e8e8', fontSize: 13, fontFamily: "'Inter',sans-serif", transition: 'border-color .15s' }}
            />
            <button
              onClick={() => sendChatMessage()}
              disabled={!inputVal.trim() || chatLoading}
              style={{ width: 36, height: 36, background: inputVal.trim() && !chatLoading ? '#f0b429' : '#2a2a2a', color: inputVal.trim() && !chatLoading ? '#000' : '#555', border: 'none', borderRadius: 8, cursor: inputVal.trim() && !chatLoading ? 'pointer' : 'default', fontSize: 16, transition: 'background .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >→</button>
          </div>
        </div>
      )}

      {chatOpen && (
        <button onClick={() => setChatOpen(false)}
          style={{ position: 'fixed', bottom: 24, right: 160, width: 52, height: 52, borderRadius: '50%', background: '#f0b429', color: '#000', border: 'none', fontSize: 20, cursor: 'pointer', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Close assistant"
        >✕</button>
      )}
    </>,
    document.body
  );

  return (
    <>
    <div className="page-scroll" style={{ background: t.bg }}>

      {/* ── Token usage bar ── */}
      {tokenStats && (
        <div style={{
          background: '#0a0a0a', borderBottom: `1px solid #141414`,
          padding: '5px 20px', fontSize: 10, color: '#3a3a3a',
          fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'center',
          letterSpacing: '.02em',
        }}>
          <span style={{ color: '#2a2a2a', textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 9, marginRight: 12 }}>AI USAGE</span>
          <span style={{ marginRight: 12 }}><span style={{ color: '#606060' }}>{tokenStats.total_triage_calls}</span> calls</span>
          <span style={{ color: '#1c1c1c', marginRight: 12 }}>·</span>
          <span style={{ marginRight: 12 }}><span style={{ color: '#606060' }}>{(tokenStats.total_tokens || 0).toLocaleString()}</span> tokens</span>
          <span style={{ color: '#1c1c1c', marginRight: 12 }}>·</span>
          <span style={{ marginRight: 12 }}><span style={{ color: '#f0b429' }}>${tokenStats.estimated_cost_usd}</span></span>
          <span style={{ color: '#1c1c1c', marginRight: 12 }}>·</span>
          <span style={{ color: '#2a2a2a' }}>claude-sonnet-4-6</span>
        </div>
      )}

      <div className="main-cols">
        {/* ── Left 60% ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <window.Card pad={0} style={{ overflow: 'hidden' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="section-title">Alert Feed</span>
                <span style={{ background: t.gold + '22', color: t.gold, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{localAlerts.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <window.Btn small variant="outline" onClick={doRefresh} disabled={busy}>
                  {refreshing ? (refreshStep || 'Working...') : 'Refresh Data'}
                </window.Btn>
                <button
                  onClick={runDemoMode}
                  disabled={busy}
                  style={{
                    background: 'transparent', border: `1px solid ${t.gold}44`,
                    color: t.gold, padding: '4px 12px', borderRadius: 5,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11,
                    opacity: demoRunning ? 0.8 : 1, whiteSpace: 'nowrap',
                    letterSpacing: '.02em',
                  }}>
                  {demoRunning ? (demoStep || 'Running...') : 'Demo Mode'}
                </button>
                <button
                  onClick={doReset}
                  disabled={busy}
                  style={{
                    background: 'transparent', border: '1px solid #2a2a2a',
                    color: '#525252', padding: '4px 12px', borderRadius: 5,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 11,
                    whiteSpace: 'nowrap', letterSpacing: '.02em',
                  }}>
                  {resetting ? 'Resetting...' : 'Reset'}
                </button>
                <window.Btn small variant="ghost" onClick={() => nav('/alerts')}>View All →</window.Btn>
              </div>
            </div>
            <div className="dt-wrap-xl">
              <table className="dt">
                <thead><tr>{['Time','Alert ID','Trader','Instrument','Pattern','Severity','Status','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {paged.length === 0 && <tr><td colSpan={8}><window.EmptyState msg="No alerts detected — click Start Replay or Demo Mode to run detection" /></td></tr>}
                  {paged.map(a => (
                    <window.AlertRow key={a.alert_id} a={a} nav={nav}
                      onTriage={doTriage} isLoading={loadingSet.has(a.alert_id)} />
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, borderTop: `1px solid ${t.border}` }}>
                <window.Btn small variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</window.Btn>
                <span style={{ color: t.textSec, fontSize: 12 }}>Page {page} / {pages}</span>
                <window.Btn small variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</window.Btn>
              </div>
            )}
            {_corrGroups.length > 0 && (
              <div style={{ padding: '16px 16px 8px 16px', borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: t.textMuted, letterSpacing: '.12em', textTransform: 'uppercase' }}>CORRELATED ACTIVITY</span>
                  <span style={{ background: t.warning + '22', color: t.warning, borderRadius: 10, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                    {_corrGroups.length + ' GROUP' + (_corrGroups.length > 1 ? 'S' : '')}
                  </span>
                </div>
                <div style={{ borderTop: `1px solid ${t.border}`, margin: '12px 0' }} />
                {_corrGroups.map((group, gi) => {
                  const spanMin = Math.round((new Date(group[group.length - 1].detected_at) - new Date(group[0].detected_at)) / 1000 / 60 * 10) / 10;
                  const uniquePatterns = [...new Set(group.map(a => a.pattern_type))];
                  return (
                    <div key={gi} style={{ background: t.card, borderRadius: 8, padding: '12px 16px', marginBottom: 8, border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 160px' }}>
                        <div style={{ color: t.danger, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', fontFamily: "'Inter',sans-serif", textTransform: 'uppercase' }}>POTENTIAL COORDINATED ACTIVITY</div>
                        <div style={{ color: t.textSec, fontSize: 12, marginTop: 3 }}>{group.length + ' alerts within ' + spanMin + '-min window'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '2 1 200px' }}>
                        {group.map(a => (
                          <span key={a.alert_id}
                            onClick={() => nav('/alert/' + a.alert_id)}
                            style={{ background: t.gold + '18', color: t.gold, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontFamily: "'JetBrains Mono',monospace", cursor: 'pointer' }}>
                            {a.alert_id}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
                        {uniquePatterns.map(pat => (
                          <window.Bdg key={pat} label={pat} cfg={window.PAT_CFG[pat]} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, marginBottom: 4 }}>Alerts within 10-minute windows may indicate coordinated manipulation. Investigate together.</div>
              </div>
            )}
          </window.Card>
          <window.MiniCharts stats={stats} />
        </div>

        {/* ── Right 40% ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <window.TopSuspects alerts={localAlerts} nav={nav} />

          <window.Card style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="section-title">Recent Escalations</span>
                <span style={{ background: t.gold + '22', color: t.gold, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{escalations.length}</span>
              </div>
              <window.Btn small variant="ghost" onClick={() => nav('/logs')}>View All →</window.Btn>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {escalations.slice(0, 8).map(e => (
                <div key={e.escalation_id}
                  onClick={() => e.alert_id && nav(`/alert/${e.alert_id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: `1px solid ${t.borderSubtle || t.border}`, borderLeft: `3px solid ${window.ESC_COL[e.action_type] || 'transparent'}`, cursor: 'pointer', transition: 'background .12s' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = t.rowHover}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textMuted, flexShrink: 0 }}>{window.fmtTime(e.created_at)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.gold, fontWeight: 700 }}>{e.alert_id}</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, color: window.ESC_COL[e.action_type] || t.textSec }}>{e.action_type}</span>
                </div>
              ))}
              {escalations.length === 0 && <window.EmptyState icon="📋" msg="No escalations yet" />}
            </div>
          </window.Card>
        </div>
      </div>

    </div>
    {chatPortal}
    </>
  );
};
