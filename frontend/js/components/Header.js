const { useState: _huseState } = React;

window.Ticker = function Ticker({ prices }) {
  const t = window.useT();
  const syms = ['HDFCBANK', 'RELIANCE', 'INFY', 'TCS', 'ICICIBANK', 'WIPRO', 'SBIN'];
  const items = syms.map(s => {
    const d = prices[s]; if (!d) return null;
    const up = d.current >= (d.low + (d.high - d.low) * .5);
    return (
      <span key={s} className="ticker-item">
        <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 10, color: t.textMuted, letterSpacing: '.08em' }}>{s}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: up ? t.success : t.danger }}>{window.fmtRs(d.current)}</span>
        <span style={{ fontSize: 10, color: up ? t.success : t.danger }}>{up ? '▲' : '▼'}</span>
      </span>
    );
  }).filter(Boolean);

  if (!items.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#525252', fontSize: 11 }}>
      Fetching live prices…
    </div>
  );

  return (
    <div className="ticker-wrap" style={{ flex: 1 }}>
      <div className="ticker-track">{items}{items}</div>
    </div>
  );
};

window.Header = function Header({ isReplaying, onStart, onStop, prices, isDark, onToggleTheme, subCount, onSubscribe }) {
  const t = window.useT();
  const [email, setEmail]       = _huseState('');
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

      <window.Ticker prices={prices} />

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
