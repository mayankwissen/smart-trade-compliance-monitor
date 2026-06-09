const { useState: _tuseS, useEffect: _tuseE, useCallback: _tuseC, useRef: _tuseR } = React;

window.FLAGGED_TRADERS = new Set(['T-1042', 'T-2891', 'T-3301']);

window.TradesPage = function TradesPage() {
  const t = window.useT();
  const [trades, setTrades] = _tuseS([]);
  const [total, setTotal]   = _tuseS(0);
  const [page, setPage]     = _tuseS(1);
  const [traderId, setTraderId]     = _tuseS('');
  const [instrument, setInstrument] = _tuseS('');
  const [status, setStatus]         = _tuseS('');
  const [autoScroll, setAutoScroll] = _tuseS(false);
  const scrollRef  = _tuseR(null);
  const scrollIdRef = _tuseR(null);
  const PER = 50;

  // Auto-scroll: slow continuous scroll that loops back to top
  _tuseE(() => {
    if (!autoScroll || !scrollRef.current) return;
    const el = scrollRef.current;
    scrollIdRef.current = setInterval(() => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
        el.scrollTop = 0;
      } else {
        el.scrollBy(0, 1);
      }
    }, 40);
    return () => { if (scrollIdRef.current) clearInterval(scrollIdRef.current); };
  }, [autoScroll, trades]);

  const fetchTrades = _tuseC(async () => {
    const q = new URLSearchParams({ page, limit: PER });
    if (traderId)   q.set('trader_id',   traderId);
    if (instrument) q.set('instrument',  instrument);
    if (status)     q.set('status',      status);
    try {
      const d = await fetch(`${window.API_BASE}/api/trades?${q}`).then(r => r.json());
      setTrades(d.trades || []); setTotal(d.total || 0);
    } catch {}
  }, [page, traderId, instrument, status]);

  _tuseE(() => { fetchTrades(); }, [fetchTrades]);

  const executed  = trades.filter(r => r.order_status === 'EXECUTED').length;
  const cancelled = trades.filter(r => r.order_status === 'CANCELLED').length;
  const cratio = trades.length > 0 ? ((cancelled / trades.length) * 100).toFixed(1) : '0.0';
  const pages = Math.ceil(total / PER) || 1;
  const sel = { background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 6, padding: '6px 10px', fontFamily: "'Inter',sans-serif", fontSize: 12, cursor: 'pointer' };

  return (
    <div className="page-scroll" style={{ background: t.bg }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          ['Total',          total,                           t.info],
          ['Executed',       executed,                        t.success],
          ['Cancelled',      cancelled,                       t.danger],
          ['Cancel Ratio',   cratio + '%',                   t.warning],
          ['Flagged Traders', window.FLAGGED_TRADERS.size,   t.danger],
        ].map(([k, v, c]) => (
          <window.Card key={k} style={{ padding: '12px 16px', borderLeft: `3px solid ${c}` }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 20, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 4 }}>{k}</div>
          </window.Card>
        ))}
      </div>

      <window.Card>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 20, color: t.text, marginBottom: 14 }}>
          Trade Explorer{' '}
          <span style={{ color: t.textMuted, fontSize: 14, fontWeight: 400 }}>{total.toLocaleString()} trades</span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={traderId} onChange={e => { setTraderId(e.target.value); setPage(1); }}
            placeholder="Filter by Trader ID…"
            style={{ ...sel, fontFamily: "'JetBrains Mono',monospace", width: 180 }} />
          <select value={instrument} onChange={e => { setInstrument(e.target.value); setPage(1); }} style={sel}>
            <option value="">All Instruments</option>
            {['HDFCBANK','RELIANCE','INFY','TCS','ICICIBANK','WIPRO','SBIN'].map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={sel}>
            <option value="">All Status</option>
            {['EXECUTED','CANCELLED','PLACED'].map(s => <option key={s}>{s}</option>)}
          </select>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={() => setAutoScroll(s => !s)}
              title={autoScroll ? 'Stop auto-scroll' : 'Start live feed scroll (mid speed)'}
              style={{
                background: autoScroll ? '#f0b42922' : 'transparent',
                border: `1px solid ${autoScroll ? '#f0b429' : t.border}`,
                color: autoScroll ? '#f0b429' : t.textMuted,
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s',
              }}>
              {autoScroll ? '⏸ Live' : '▶ Live Feed'}
            </button>
            <span style={{ padding: '4px 10px', background: t.danger + '22', border: `1px solid ${t.danger}44`, borderRadius: 6, fontSize: 11, color: t.danger, fontFamily: "'Inter',sans-serif", fontWeight: 700 }}>
              🚩 Red rows = flagged traders (T-1042, T-2891, T-3301)
            </span>
          </div>
        </div>

        <div ref={scrollRef} className="dt-wrap-xl" style={{ overflowX: 'auto', maxHeight: autoScroll ? 480 : 'none', overflowY: autoScroll ? 'auto' : 'visible', transition: 'max-height .3s' }}>
          <table className="dt">
            <thead>
              <tr>{['Trade ID','Timestamp','Trader','Instrument','Type','Size','Price','Status','Cancel ms'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {trades.length === 0 && <tr><td colSpan={9}><window.EmptyState icon="📊" msg="No trades found" /></td></tr>}
              {trades.map((tr, i) => {
                const flagged = window.FLAGGED_TRADERS.has(tr.trader_id);
                return (
                  <tr key={i}
                    className={flagged ? 'flagged' : ''}
                    title={flagged ? '⚠ Flagged trader — alerts on record' : ''}>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textMuted }}>{tr.trade_id}</span></td>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.textSec }}>{tr.timestamp}</span></td>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: flagged ? t.danger : t.gold, fontWeight: 700 }}>{tr.trader_id}{flagged ? ' 🚩' : ''}</span></td>
                    <td><span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: t.text }}>{tr.instrument}</span></td>
                    <td><span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: tr.order_type === 'BUY' ? t.success : t.danger }}>{tr.order_type}</span></td>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.text }}>{window.fmtNum(tr.order_size)}</span></td>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.gold, fontWeight: 700 }}>{window.fmtRs(tr.price)}</span></td>
                    <td>
                      <window.Bdg label={tr.order_status}
                        cfg={tr.order_status === 'EXECUTED'  ? { bg: '#22c55e22', c: '#22c55e' }
                           : tr.order_status === 'CANCELLED' ? { bg: '#ef444422', c: '#ef4444' }
                           :                                   { bg: '#2a2a2a',   c: '#a0a0a0' }} />
                    </td>
                    <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: tr.cancel_time_ms > 0 && tr.cancel_time_ms < 600 ? t.danger : t.textSec }}>{tr.cancel_time_ms || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}>
            <window.Btn small variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</window.Btn>
            <span style={{ color: t.textSec, fontSize: 12 }}>Page {page} / {pages} &nbsp;·&nbsp; {total} trades</span>
            <window.Btn small variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</window.Btn>
          </div>
        )}
      </window.Card>
    </div>
  );
};
