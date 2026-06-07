const { useState: _huseState, useEffect: _huseE, useRef: _huseRef } = React;

// ── Vertical NSE price panel — auto-scroll + search ───────────────────────
window.PricePanel = function PricePanel({ prices }) {
  const [searchTerm, setSearchTerm] = _huseState('');
  const [lastUpdated, setLastUpdated] = _huseState('');
  const prevRef = _huseRef({});   // stores last price snapshot for change%

  _huseE(() => {
    if (!prices || Object.keys(prices).length === 0) return;
    setLastUpdated(new Date().toLocaleTimeString());
    // Save current prices as the "previous" baseline for next refresh
    const snap = {};
    Object.keys(prices).forEach(k => { snap[k] = prices[k].current; });
    prevRef.current = snap;
  }, [prices]);

  const allSyms     = Object.keys(prices);
  const isSearching = searchTerm.trim() !== '';
  const filteredSyms = isSearching
    ? allSyms.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
    : allSyms;

  // Renders a single stock row
  const StockRow = function({ sym, borderBottom }) {
    const d    = prices[sym];
    const curr = d ? Number(d.current) : null;
    const prev = prevRef.current[sym];
    const hasDelta = curr !== null && prev !== undefined && prev !== 0 && prev !== curr;
    const delta    = hasDelta ? ((curr - prev) / prev) * 100 : null;
    const up  = delta !== null ? delta >= 0
      : (d ? curr >= (d.low + (d.high - d.low) * 0.5) : true);
    const clr = up ? '#22c55e' : '#ef4444';

    return (
      <div style={{ padding: '6px 0', borderBottom: borderBottom ? '1px solid #1c1c1c' : 'none' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#c8c8c8', letterSpacing: '.02em' }}>{sym}</div>
        {curr !== null ? (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: clr, fontWeight: 700, marginTop: 1 }}>
              &#8377;{curr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 9, color: clr, marginTop: 1, fontFamily: "'JetBrains Mono',monospace" }}>
              {up ? '▲' : '▼'}{delta !== null ? ` ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%` : ''}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 10, color: '#3a3a3a', marginTop: 2 }}>—</div>
        )}
      </div>
    );
  };

  return (
    <div id="price-panel">
      {/* Search */}
      <input
        type="text"
        placeholder="Search..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{
          width: '100%', background: '#141414', border: '1px solid #242424',
          color: '#c8c8c8', fontSize: 10, borderRadius: 3, padding: '4px 6px',
          marginBottom: 6, fontFamily: "'Inter',sans-serif", outline: 'none',
          letterSpacing: '.01em', flexShrink: 0,
        }}
      />

      {/* NSE LIVE label */}
      <div style={{
        color: '#f0b429', fontSize: 9, fontWeight: 700, letterSpacing: '2px',
        textTransform: 'uppercase', borderBottom: '1px solid #1c1c1c',
        paddingBottom: 5, marginBottom: 0, flexShrink: 0,
      }}>NSE LIVE</div>

      {/* Stock list body */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isSearching ? (
          // Static filtered list with manual scroll
          <div style={{ overflowY: 'auto', height: '100%' }}>
            {filteredSyms.length === 0
              ? <div style={{ fontSize: 10, color: '#3a3a3a', padding: '10px 0' }}>No results</div>
              : filteredSyms.map((s, i) => <StockRow key={s} sym={s} borderBottom={i < filteredSyms.length - 1} />)
            }
          </div>
        ) : (
          // Auto-scroll: duplicate the list for a seamless loop
          <div className="price-scroll-track">
            {[...allSyms, ...allSyms].map((s, i) => (
              <StockRow key={s + i} sym={s} borderBottom={true} />
            ))}
          </div>
        )}
      </div>

      {/* Last updated */}
      <div style={{
        paddingTop: 5, marginTop: 5, borderTop: '1px solid #1c1c1c',
        fontSize: 9, color: '#3a3a3a', fontFamily: "'JetBrains Mono',monospace",
        lineHeight: 1.6, flexShrink: 0,
      }}>
        {lastUpdated ? <span>Updated<br />{lastUpdated}</span> : <span>Loading...</span>}
      </div>
    </div>
  );
};

// ── Fixed header — logo left, subscribe center-right, replay right ─────────
window.Header = function Header({ isReplaying, onStart, onStop, isDark, onToggleTheme, subCount, onSubscribe, nav, onRefreshComplete }) {
  const t = window.useT();
  const [email, setEmail]               = _huseState('');
  const [subStatus, setSubStatus]       = _huseState('');   // '' | 'subscribed' | 'error'
  const [subscribedEmail, setSubscribedEmail] = _huseState('');

  // ── Voice command state ──────────────────────────────────────────────────
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceSupported = !!SpeechRecognition;
  const [listening, setListening]     = _huseState(false);
  const [transcript, setTranscript]   = _huseState('');
  const [toastMsg, setToastMsg]       = _huseState('');
  const recognitionRef                = _huseRef(null);
  const toastTimerRef                 = _huseRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 2000);
  };

  // API helpers for non-nav commands
  const triageFirstPending = async () => {
    try {
      const res  = await fetch(`${window.API_BASE}/api/alerts`).then(r => r.json());
      const pend = (res.alerts || []).find(a => a.status === 'PENDING');
      if (pend) {
        await fetch(`${window.API_BASE}/api/triage/${pend.alert_id}`, { method: 'POST' });
        if (onRefreshComplete) onRefreshComplete();
      }
    } catch {}
  };

  const startReplay = async () => {
    try {
      await fetch(`${window.API_BASE}/api/replay/start`, { method: 'POST' });
      if (onRefreshComplete) onRefreshComplete();
      onStart && onStart();
    } catch {}
  };

  const resetDemo = async () => {
    try {
      await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' });
      await fetch(`${window.API_BASE}/api/reset`, { method: 'POST' });
      if (onRefreshComplete) onRefreshComplete();
    } catch {}
  };

  const runDemoMode = async () => {
    try {
      await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' });
      await fetch(`${window.API_BASE}/api/replay/start`, { method: 'POST' });
      const res  = await fetch(`${window.API_BASE}/api/alerts`).then(r => r.json());
      const high = (res.alerts || []).find(a => a.severity === 'HIGH' && a.status === 'PENDING');
      if (high) await fetch(`${window.API_BASE}/api/triage/${high.alert_id}`, { method: 'POST' });
      if (onRefreshComplete) onRefreshComplete();
    } catch {}
  };

  const handleCommand = (spoken) => {
    if (!nav) return;
    const commands = [
      ['dashboard',      () => nav('/')],
      ['home',           () => nav('/')],
      ['show alerts',    () => nav('/alerts')],
      ['alerts',         () => nav('/alerts')],
      ['show trades',    () => nav('/trades')],
      ['trades',         () => nav('/trades')],
      ['show logs',      () => nav('/logs')],
      ['logs',           () => nav('/logs')],
      ['settings',       () => nav('/settings')],
      ['config',         () => nav('/settings')],
      ['top suspect',    () => nav('/trader/T-2891')],
      ['trader profile', () => nav('/trader/T-2891')],
      ['triage',         triageFirstPending],
      ['start replay',   startReplay],
      ['demo mode',      runDemoMode],
      ['reset',          resetDemo],
    ];
    for (const [cmd, action] of commands) {
      if (spoken.includes(cmd)) {
        action();
        showToast('✓ Command: ' + cmd);
        return;
      }
    }
  };

  const initRecognition = () => {
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.continuous     = false;
    r.interimResults = true;
    r.lang           = 'en-US';
    r.onstart  = () => { setListening(true); setTranscript(''); };
    r.onend    = () => setListening(false);
    r.onerror  = () => setListening(false);
    r.onresult = (event) => {
      const text = Array.from(event.results).map(res => res[0].transcript).join('');
      setTranscript(text);
      if (event.results[event.results.length - 1].isFinal) {
        handleCommand(text.toLowerCase());
      }
    };
    return r;
  };

  const toggleVoice = () => {
    if (!voiceSupported) return;
    if (listening) {
      recognitionRef.current && recognitionRef.current.stop();
    } else {
      recognitionRef.current = initRecognition();
      try { recognitionRef.current && recognitionRef.current.start(); } catch {}
    }
  };

  const doSubscribe = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) return;
    try {
      const r = await fetch(`${window.API_BASE}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const d = await r.json();
      if (d.status === 'subscribed') {
        setSubStatus('subscribed');
        setSubscribedEmail(trimmed);
        setEmail('');
        onSubscribe && onSubscribe();
      }
    } catch { setSubStatus('error'); }
  };

  const doUnsubscribe = async () => {
    try {
      await fetch(`${window.API_BASE}/api/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subscribedEmail }),
      });
    } catch {}
    setSubStatus('');
    setSubscribedEmail('');
    onSubscribe && onSubscribe();
  };

  return (
    <div id="app-header">
      {/* Logo + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: '#f0b42914', border: '1px solid #f0b42966',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}>🛡</div>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 17, color: '#f0b429', letterSpacing: '.04em', lineHeight: 1.1 }}>
            TRADE SURVEILLANCE ENGINE
          </div>
          <div style={{ fontSize: 10, color: '#404040', fontFamily: "'Inter',sans-serif", letterSpacing: '.03em', marginTop: 1 }}>
            NSE Market Integrity · Powered by Claude AI
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Subscribe / Unsubscribe */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {subStatus === 'subscribed' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 5, padding: '4px 10px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#808080', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subscribedEmail}</span>
            </div>
            <button
              onClick={doUnsubscribe}
              style={{ background: 'transparent', color: '#525252', border: '1px solid #2a2a2a', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 10, letterSpacing: '.02em', transition: 'color .15s, border-color .15s' }}
              onMouseEnter={e => { e.target.style.color = '#ef4444'; e.target.style.borderColor = '#ef444444'; }}
              onMouseLeave={e => { e.target.style.color = '#525252'; e.target.style.borderColor = '#2a2a2a'; }}
            >
              Unsubscribe
            </button>
          </div>
        ) : (
          <>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="analyst@firm.com"
              onKeyDown={e => e.key === 'Enter' && doSubscribe()}
              style={{
                background: '#0d0d0d', border: `1px solid ${subStatus === 'error' ? '#ef444466' : '#2a2a2a'}`,
                color: '#c8c8c8', borderRadius: 5, padding: '6px 10px',
                fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
                width: 160, outline: 'none', letterSpacing: '.02em',
              }}
            />
            <button
              onClick={doSubscribe}
              style={{
                background: 'transparent', color: '#22c55e',
                border: '1px solid #22c55e44', borderRadius: 5,
                padding: '6px 14px', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11,
                letterSpacing: '.02em', transition: 'background .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#22c55e11'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              Subscribe
            </button>
            {subStatus === 'error' && (
              <span style={{ fontSize: 10, color: '#ef4444', fontFamily: "'Inter',sans-serif" }}>Failed</span>
            )}
          </>
        )}

        {subCount > 0 && (
          <span style={{ color: '#404040', fontSize: 10, fontFamily: "'Inter',sans-serif", letterSpacing: '.02em' }}>
            {subCount} subscriber{subCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: '#1c1c1c', margin: '0 2px' }} />

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title="Toggle theme"
          style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 5, padding: '5px 8px', cursor: 'pointer', fontSize: 13, color: '#525252', lineHeight: 1 }}
        >
          {isDark ? '☀' : '◑'}
        </button>

        {/* Voice command button */}
        {voiceSupported && (
          <button
            onClick={toggleVoice}
            title={'Voice Commands\ndashboard · alerts · trades · logs\ntop suspect · triage · reset · demo mode'}
            style={{
              width: 40, height: 40, borderRadius: 8,
              background: listening ? 'rgba(239,68,68,0.15)' : t.card,
              border: `1px solid ${listening ? '#ef4444' : t.border}`,
              color: listening ? '#ef4444' : t.textMuted,
              cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
              animation: listening ? 'voicePulse 1s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }}
          >🎤</button>
        )}

        {/* Voice listening panel */}
        {listening && (
          <div style={{
            position: 'fixed', top: 74, right: 160,
            background: t.card,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: '16px 20px',
            width: 280,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 200,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11, color: t.gold,
                letterSpacing: '2px', fontWeight: 700,
              }}>LISTENING...</span>
              {/* Sound wave bars */}
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 3, borderRadius: 2,
                    background: '#ef4444',
                    animation: `voiceBar${i} 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
                  }} />
                ))}
              </div>
            </div>
            {transcript && (
              <div style={{
                fontSize: 13, color: t.textSec,
                fontStyle: 'italic', marginBottom: 10,
                minHeight: 18,
              }}>"{transcript}"</div>
            )}
            <div style={{
              fontSize: 11, color: t.textMuted,
              lineHeight: 1.7,
              fontFamily: "'Inter',sans-serif",
            }}>
              Say: <span style={{ color: t.textSec }}>dashboard · alerts · trades · logs · settings · top suspect · triage · start replay · demo mode · reset</span>
            </div>
          </div>
        )}

        {/* Voice command toast */}
        {toastMsg && (
          <div style={{
            position: 'fixed', bottom: 80, left: '50%',
            transform: 'translateX(-50%)',
            background: t.gold, color: '#000',
            padding: '8px 20px', borderRadius: 20,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 12, fontWeight: 700,
            zIndex: 600,
            animation: 'toastFade 2s ease forwards',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>{toastMsg}</div>
        )}

        {/* CSS for voice animations */}
        <style>{`
          @keyframes voicePulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
          }
          @keyframes voiceBar0 { from { height: 6px; } to { height: 18px; } }
          @keyframes voiceBar1 { from { height: 10px; } to { height: 22px; } }
          @keyframes voiceBar2 { from { height: 5px; } to { height: 14px; } }
          @keyframes toastFade {
            0%   { opacity: 0; transform: translateX(-50%) translateY(8px); }
            15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
            70%  { opacity: 1; }
            100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          }
        `}</style>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: '#1c1c1c', margin: '0 2px' }} />

        {/* Replay control */}
        {isReplaying ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
              <span style={{ color: '#22c55e', fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em' }}>LIVE</span>
            </div>
            <button
              onClick={onStop}
              style={{ background: '#141414', color: '#808080', border: '1px solid #2a2a2a', borderRadius: 5, padding: '6px 14px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: '.02em' }}
            >
              Stop
            </button>
          </div>
        ) : (
          <button
            onClick={onStart}
            style={{ background: '#f0b429', color: '#000', border: 'none', borderRadius: 5, padding: '7px 18px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '.04em' }}
          >
            START REPLAY
          </button>
        )}
      </div>
    </div>
  );
};
