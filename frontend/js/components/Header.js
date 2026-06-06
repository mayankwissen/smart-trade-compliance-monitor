const { useState: _huseState, useEffect: _huseE, useRef: _huseRef } = React;

// ── Vertical NSE price panel (right side) ─────────────────────────────────
window.PricePanel = function PricePanel({ prices }) {
  const [searchTerm, setSearchTerm] = _huseState('');
  const [lastUpdated, setLastUpdated] = _huseState('');
  const [prevPrices, setPrevPrices]   = _huseState({});
  const isFirst = _huseRef(true);

  _huseE(() => {
    if (!prices || Object.keys(prices).length === 0) return;
    setLastUpdated(new Date().toLocaleTimeString());
    // On first load just store baseline; subsequent updates compute change%
    if (isFirst.current) {
      isFirst.current = false;
      setPrevPrices(prev => {
        const snap = {};
        Object.keys(prices).forEach(k => { snap[k] = prices[k].current; });
        return snap;
      });
    } else {
      setPrevPrices(prev => {
        const snap = {};
        Object.keys(prices).forEach(k => {
          snap[k] = prev[k] !== undefined ? prev[k] : prices[k].current;
        });
        return snap;
      });
    }
  }, [prices]);

  // Filter by search — use all symbols present in prices object
  const allSyms = Object.keys(prices);
  const filteredPrices = allSyms.filter(sym =>
    searchTerm === '' || sym.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="price-panel">
      {/* Search */}
      <input
        type="text"
        placeholder="Search stock..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        style={{
          width: '100%', background: '#1a1a1a', border: '1px solid #2a2a2a',
          color: '#fff', fontSize: 11, borderRadius: 4, padding: '5px 6px',
          marginBottom: 8, fontFamily: "'Inter',sans-serif", outline: 'none',
          flexShrink: 0,
        }}
      />

      {/* Panel title */}
      <div style={{
        color: '#f0b429', fontSize: 11, fontWeight: 700, letterSpacing: '1px',
        textTransform: 'uppercase', borderBottom: '1px solid #2a2a2a',
        paddingBottom: 8, marginBottom: 4, flexShrink: 0,
      }}>NSE LIVE</div>

      {/* Stock rows */}
      {filteredPrices.map((sym, i) => {
        const d      = prices[sym];
        const isLast = i === filteredPrices.length - 1;
        if (!d) return (
          <div key={sym} style={{ padding: '7px 0', borderBottom: isLast ? 'none' : '1px solid #1a1a1a' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{sym}</div>
            <div style={{ fontSize: 10, color: '#525252' }}>—</div>
          </div>
        );

        const curr   = Number(d.current);
        const prev   = prevPrices[sym];
        const hasPrev = prev !== undefined && prev !== curr;
        const delta  = hasPrev ? ((curr - prev) / prev) * 100 : null;
        const up     = delta !== null ? delta >= 0 : curr >= (d.low + (d.high - d.low) * 0.5);
        const clr    = up ? '#22c55e' : '#ef4444';

        return (
          <div key={sym} style={{ padding: '7px 0', borderBottom: isLast ? 'none' : '1px solid #1a1a1a' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 1 }}>{sym}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: clr, fontWeight: 700 }}>
              ₹{curr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 10, color: clr, marginTop: 1 }}>
              {up ? '▲' : '▼'}{delta !== null ? ` ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%` : ''}
            </div>
          </div>
        );
      })}

      {filteredPrices.length === 0 && (
        <div style={{ fontSize: 10, color: '#525252', padding: '8px 0' }}>No match</div>
      )}

      {/* Last updated — always at bottom, sticky via padding */}
      <div style={{
        paddingTop: 10, marginTop: 8, borderTop: '1px solid #1a1a1a',
        fontSize: 10, color: '#525252', fontFamily: "'JetBrains Mono',monospace",
        lineHeight: 1.6, flexShrink: 0,
      }}>
        Updated:<br />{lastUpdated || '—'}
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
