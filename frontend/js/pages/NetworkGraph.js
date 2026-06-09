const { useState: _nguseS, useEffect: _nguseE, useCallback: _nguseC, useRef: _nguseR } = React;

window.NetworkGraphPage = function NetworkGraphPage({ nav }) {
  const t = window.useT();
  const containerRef = _nguseR(null);
  const networkRef = _nguseR(null);
  const [graphData, setGraphData] = _nguseS(null);
  const [loading, setLoading] = _nguseS(true);
  const [error, setError] = _nguseS(null);
  const [frozen, setFrozen] = _nguseS(false);
  const [selectedNode, setSelectedNode] = _nguseS(null);
  const [filterRisk, setFilterRisk] = _nguseS('all'); // 'all' | 'high' | 'medium' | 'normal'

  const loadGraph = _nguseC(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetch(window.API_BASE + '/api/network-graph').then(r => r.json());
      if (d.error) { setError(d.error); setLoading(false); return; }
      setGraphData(d);
    } catch (e) {
      setError('Failed to load network data');
    }
    setLoading(false);
  }, []);

  _nguseE(() => { loadGraph(); }, [loadGraph]);

  _nguseE(() => {
    if (!graphData || !containerRef.current || loading) return;
    if (typeof vis === 'undefined') return;

    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    const visNodes = new vis.DataSet(graphData.nodes.map(n => ({
      id: n.id,
      label: n.label,
      color: {
        background: n.color,
        border: n.risk_score > 70 ? '#ff0000' : n.color,
        highlight: { background: '#f0b429', border: '#f0b429' },
      },
      size: n.size,
      font: { color: '#f0f2f8', size: 12, face: 'Inter' },
      title: `${n.id}\nRisk: ${n.risk_score}/100\nAlerts: ${n.alert_count}`,
    })));

    const visEdges = new vis.DataSet(graphData.edges.map((e, i) => ({
      id: i,
      from: e.from,
      to: e.to,
      color: { color: e.suspicious ? '#ef4444' : '#404040', highlight: '#f0b429' },
      dashes: e.suspicious,
      width: Math.min(5, 1 + e.weight),
      title: `${e.instrument}\nTrades: ${e.weight}\nValue: ₹${(e.value / 1e7).toFixed(2)}Cr`,
      arrows: { to: { enabled: true, scaleFactor: 0.6 } },
    })));

    const options = {
      nodes: {
        shape: 'dot',
        font: { color: '#f0f2f8', size: 12 },
        borderWidth: 2,
      },
      edges: {
        smooth: { type: 'curvedCW', roundness: 0.2 },
      },
      physics: {
        stabilization: { iterations: 100 },
        barnesHut: { gravitationalConstant: -3000, springLength: 120 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true,
      },
      background: { color: '#0a0f1c' },
    };

    const network = new vis.Network(containerRef.current, { nodes: visNodes, edges: visEdges }, options);
    networkRef.current = network;

    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nd = graphData.nodes.find(n => n.id === nodeId);
        setSelectedNode(nd || null);
      }
    });

    network.on('doubleClick', (params) => {
      if (params.nodes.length > 0) nav('/trader/' + params.nodes[0]);
    });

    // Pulse suspicious nodes via interval color flash
    const pulseInterval = setInterval(() => {
      const suspNodes = graphData.nodes.filter(n => n.risk_score > 70);
      if (!networkRef.current) return;
      suspNodes.forEach(n => {
        const update = { id: n.id, color: { background: '#ef444488', border: '#ef4444' } };
        visNodes.update(update);
        setTimeout(() => {
          visNodes.update({ id: n.id, color: { background: n.color, border: n.risk_score > 70 ? '#ff0000' : n.color } });
        }, 400);
      });
    }, 2000);

    return () => {
      clearInterval(pulseInterval);
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [graphData, loading]);

  // Freeze/unfreeze physics
  _nguseE(() => {
    if (!networkRef.current) return;
    if (frozen) {
      networkRef.current.setOptions({ physics: { enabled: false } });
    } else {
      networkRef.current.setOptions({ physics: { enabled: true } });
    }
  }, [frozen]);

  const stats = graphData?.stats || {};

  return (
    <div className="page-scroll" style={{ background: t.bg }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 18, color: t.gold, letterSpacing: '.08em', marginBottom: 4 }}>
          TRADER NETWORK ANALYSIS
        </div>
        <div style={{ color: t.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif" }}>
          Detecting coordinated manipulation and circular trading patterns
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ color: t.gold, fontFamily: "'Inter',sans-serif", fontSize: 14, marginBottom: 12 }}>
            Analyzing trader relationships...
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%', background: t.gold,
                animation: `pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      )}

      {error && !loading && (
        <div style={{ color: t.danger, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, padding: 20, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {!loading && !error && graphData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* Left: vis.js network */}
          <window.Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${t.border}`, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, color: t.text, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Network Graph
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Legend */}
                {[['#ef4444','Suspicious'],['#f59e0b','Monitor'],['#22c55e','Normal']].map(([c,l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
                  </span>
                ))}
                <div style={{ width: 1, height: 16, background: t.border }} />
                {/* Freeze toggle */}
                <button
                  onClick={() => setFrozen(f => !f)}
                  title={frozen ? 'Unfreeze layout' : 'Freeze layout'}
                  style={{ background: frozen ? '#f0b42922' : 'transparent', border: `1px solid ${frozen ? '#f0b429' : t.border}`, color: frozen ? '#f0b429' : t.textMuted, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.04em' }}>
                  {frozen ? '🔒 Frozen' : '▶ Animate'}
                </button>
                {/* Fit / reset view */}
                <button
                  onClick={() => networkRef.current && networkRef.current.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } })}
                  title="Fit all nodes in view"
                  style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.04em' }}>
                  ⊞ Fit
                </button>
              </div>
            </div>
            <div
              ref={containerRef}
              style={{
                height: 500,
                background: '#0a0f1c',
                width: '100%',
              }}
            />
            {selectedNode && (
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${t.border}`, background: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: selectedNode.risk_score > 70 ? '#ef4444' : selectedNode.risk_score > 40 ? '#f59e0b' : '#22c55e', fontSize: 14 }}>{selectedNode.id}</span>
                <span style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>Risk: <b style={{ color: t.gold }}>{selectedNode.risk_score}/100</b></span>
                <span style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>Alerts: <b style={{ color: t.gold }}>{selectedNode.alert_count}</b></span>
                <button onClick={() => nav('/trader/' + selectedNode.id)} style={{ background: 'transparent', border: `1px solid ${t.gold}44`, color: t.gold, borderRadius: 4, padding: '3px 10px', fontSize: 10, cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.06em' }}>View Profile →</button>
                <button onClick={() => setSelectedNode(null)} style={{ background: 'transparent', border: 'none', color: t.textMuted, fontSize: 14, cursor: 'pointer', marginLeft: 'auto' }}>×</button>
              </div>
            )}
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${t.border}`, fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
              Click node to inspect · Double-click to view profile · Scroll to zoom · Red dashed = suspicious edges
            </div>
          </window.Card>

          {/* Right panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Network stats */}
            <window.Card>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, color: t.textMuted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>Network Stats</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Total Traders',          stats.total_traders || 0,             t.info],
                  ['Suspicious Connections', stats.suspicious_connections || 0,    t.danger],
                  ['Clusters Detected',      stats.clusters_detected || 0,         t.warning],
                  ['Circular Patterns',      (graphData.circular_trades || []).length, t.gold],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
                    <span style={{ color: t.textSec, fontSize: 12, fontFamily: "'Inter',sans-serif" }}>{k}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: c, fontSize: 14 }}>{v}</span>
                  </div>
                ))}
                {stats.highest_risk_trader && (
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", marginBottom: 4 }}>HIGHEST RISK TRADER</div>
                    <span
                      onClick={() => nav('/trader/' + stats.highest_risk_trader)}
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: t.gold, fontSize: 14, cursor: 'pointer', textDecoration: 'underline dotted' }}>
                      {stats.highest_risk_trader}
                    </span>
                  </div>
                )}
              </div>
            </window.Card>

            {/* Suspicious clusters */}
            <window.Card style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, color: t.textMuted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                Suspicious Clusters ({(graphData.clusters || []).length})
              </div>
              {(graphData.clusters || []).length === 0 ? (
                <window.EmptyState icon="🕸" msg="No suspicious clusters detected" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto' }}>
                  {(graphData.clusters || []).map((c, i) => (
                    <div key={i} style={{ background: t.bg, border: `1px solid ${t.danger}33`, borderLeft: `3px solid ${t.danger}`, borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        {c.traders.map(tid => (
                          <span key={tid}
                            onClick={() => nav('/trader/' + tid)}
                            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.gold, fontWeight: 700, cursor: 'pointer' }}>
                            {tid}
                          </span>
                        ))}
                        <window.Bdg label={c.pattern} cfg={{ bg: '#ef444422', c: '#ef4444' }} />
                        <window.Bdg label={c.risk} cfg={{ bg: '#f59e0b22', c: '#f59e0b' }} />
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif", lineHeight: 1.5, marginBottom: 8 }}>
                        {c.description}
                      </div>
                      <button
                        onClick={() => nav('/trader/' + c.traders[0])}
                        style={{ background: 'transparent', border: `1px solid ${t.gold}44`, color: t.gold, borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter',sans-serif", letterSpacing: '.06em' }}>
                        Investigate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </window.Card>

            {/* Circular trades */}
            {(graphData.circular_trades || []).length > 0 && (
              <window.Card>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11, color: t.textMuted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Circular Patterns
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(graphData.circular_trades || []).slice(0, 3).map((ct, i) => (
                    <div key={i} style={{ fontSize: 11, color: t.textSec, fontFamily: "'JetBrains Mono',monospace", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4, padding: '6px 10px' }}>
                      <span style={{ color: t.danger }}>⟳</span> {ct.pattern} <span style={{ color: t.textMuted }}>· {ct.instrument}</span>
                    </div>
                  ))}
                </div>
              </window.Card>
            )}
          </div>
        </div>
      )}

      {/* Refresh button */}
      {!loading && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <window.Btn small variant="outline" onClick={loadGraph}>Refresh Graph</window.Btn>
        </div>
      )}
    </div>
  );
};
