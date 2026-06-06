const { useState: _huseState, useEffect: _huseE } = React;

// ── Vertical NSE price panel (right side) ─────────────────────────────────
window.PricePanel = function PricePanel({ prices }) {
  const [search, setSearch]           = _huseState('');
  const [lastUpdated, setLastUpdated] = _huseState('');

  _huseE(() => {
    if (prices && Object.keys(prices).length > 0) {
      setLastUpdated(new Date().toLocaleTimeString());
    }
  }, [prices]);

  const syms     = ['HDFCBANK', 'RELIANCE', 'INFY', 'TCS', 'ICICIBANK', 'WIPRO', 'SBIN'];
  const filtered = syms.filter(s => search === '' || s.toLowerCase().includes(search.toLowerCase()));

  return (
    <div id="price-panel">
      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search..."
        style={{
          width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a',
          color: '#fff', fontSize: 11, borderRadius: 4, padding: '5px 8px',
          marginBottom: 8, fontFamily: "'Inter',sans-serif", outline: 'none',
        }}
      />

      {/* Panel title */}
      <div style={{
        color: '#f0b429', fontSize: 11, fontWeight: 700, letterSpacing: '1px',
        textTransform: 'uppercase', borderBottom: '1px solid #2a2a2a',
        paddingBottom: 8, marginBottom: 8,
      }}>NSE LIVE</div>

      {/* Stock rows */}
      <div style={{ flex: 1 }}>
        {filtered.map((sym, i) => {
          const d      = prices[sym];
          const isLast = i === filtered.length - 1;
          if (!d) return (
            <div key={sym} style={{ padding: '8px 0', borderBottom: isLast ? 'none' : '1px solid #1a1a1a' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{sym}</div>
              <div style={{ fontSize: 11, color: '#525252' }}>—</div>
            </div>
          );
          const up  = d.current >= (d.low + (d.high - d.low) * 0.5);
          const clr = up ? '#22c55e' : '#ef4444';
          return (
            <div key={sym} style={{ padding: '8px 0', borderBottom: isLast ? 'none' : '1px solid #1a1a1a' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{sym}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: clr, fontWeight: 700 }}>
                ₹{Number(d.current).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 10, color: clr, marginTop: 1 }}>{up ? '▲' : '▼'}</div>
            </div>
          );
        })}
      </div>

      {/* Last updated */}
      <div style={{
        marginTop: 12, paddingTop: 8, borderTop: '1px solid #1a1a1a',
        fontSize: 10, color: '#525252', fontFamily: "'JetBrains Mono',monospace",
        lineHeight: 1.6,
      }}>
        Last updated:<br />{lastUpdated || '—'}
      </div>
    </div>
  );
};

// ── Fixed header (logo left + controls right, no ticker) ──────────────────
window.Header = function Header({ isReplaying, onStart, onStop, isDark, onToggleTheme, subCount, onSubscribe }) {
  const t = window.useT();
  const [email, setEmail]         = _huseState('');
  const [subStatus, setSubStatus] = _huseState('');

  const doSubscribe = async () => {
    if (!email || !email.includes('@')) return;
    try {
      const r = await fetch(`${window.API_BASE}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (d.status === 'subscribed') { setSubStatus('subscribed'); onSubscribe && onSubscribe(); }
    } catch { setSubStatus('error'); }
  };

  return (
    <div id="app-header">
      {/* Logo + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#f0b42922', border: '1px solid #f0b429', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 0 12px #f0b42940' }}>🛡</div>
        <div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 18, color: '#f0b429', letterSpacing: '.03em' }}>TRADE SURVEILLANCE ENGINE</div>
          <div style={{ fontSize: 11, color: '#525252', fontFamily: "'Inter',sans-serif" }}>Wissen Technology Hackathon 2026 · Claude AI</div>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {subStatus === 'subscribed'
          ? <span style={{ color: t.success, fontSize: 12, fontWeight: 600 }}>✓ Subscribed</span>
          : <>
              <input value={email} onChange={e => setEmail(e.target.value)}
                placeholder="analyst@bank.com"
                onKeyDown={e => e.key === 'Enter' && doSubscribe()}
                style={{ background: '#1a1a1a', border: `1px solid ${t.border}`, color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", width: 148, outline: 'none' }} />
              <button onClick={doSubscribe} style={{ background: 'transparent', color: t.success, border: `1px solid ${t.success}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 11 }}>Subscribe</button>
            </>
        }
        {subCount > 0 && <span style={{ color: t.textMuted, fontSize: 11 }}>👥 {subCount}</span>}
        <button onClick={onToggleTheme}
          style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontSize: 14, color: t.textSec }}
          title="Toggle theme">
          {isDark ? '☀' : '🌙'}
        </button>
        <div style={{ width: 1, height: 28, background: t.border }} />
        {isReplaying ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.success, display: 'inline-block', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
            <span style={{ color: t.success, fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 700 }}>LIVE</span>
            <button onClick={onStop} style={{ background: '#1a1a1a', color: t.textSec, border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 12 }}>⏹ STOP</button>
          </div>
        ) : (
          <button onClick={onStart} style={{ background: '#f0b429', color: '#000', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12 }}>▶ START REPLAY</button>
        )}
      </div>
    </div>
  );
};
