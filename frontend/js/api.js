// Shared constants, themes, and utilities — loaded first, exported to window.*

window.API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://smart-trade-compliance-monitor.onrender.com';

window.DARK = {
  bg: '#0a0a0a', sidebar: '#0f0f0f', card: '#141414', border: '#2a2a2a',
  borderSubtle: '#1a1a1a', gold: '#f0b429', goldHover: '#fbbf24',
  success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', info: '#3b82f6',
  text: '#ffffff', textSec: '#a0a0a0', textMuted: '#525252',
  rowHover: 'rgba(240,180,41,.04)', rowSelected: 'rgba(240,180,41,.07)',
  inputBg: '#1a1a1a', inputBorder: '#2a2a2a',
  tagLayering: '#6366f1', tagSpoofing: '#ef4444', tagWash: '#f97316', tagPump: '#ec4899',
};

window.LIGHT = {
  bg: '#f8fafc', sidebar: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
  borderSubtle: '#f1f5f9', gold: '#1e3a8a', goldHover: '#1d4ed8',
  success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#2563eb',
  text: '#0f172a', textSec: '#475569', textMuted: '#94a3b8',
  rowHover: 'rgba(30,58,138,.04)', rowSelected: 'rgba(30,58,138,.07)',
  inputBg: '#f8fafc', inputBorder: '#e2e8f0',
  tagLayering: '#4f46e5', tagSpoofing: '#dc2626', tagWash: '#ea580c', tagPump: '#db2777',
};

window.SEV_CFG = {
  HIGH:   { bg: '#ef4444', c: '#fff' },
  MEDIUM: { bg: '#f59e0b', c: '#fff' },
  LOW:    { bg: '#22c55e', c: '#fff' },
};

window.PAT_CFG = {
  LAYERING:    { bg: '#6366f1', c: '#fff' },
  SPOOFING:    { bg: '#ef4444', c: '#fff' },
  WASH_TRADING: { bg: '#f97316', c: '#fff' },
  PUMP_DUMP:   { bg: '#ec4899', c: '#fff' },
};

window.STA_CFG = {
  PENDING:   { bg: '#374151', c: '#9ca3af' },
  ESCALATED: { bg: '#ef4444', c: '#fff', pulse: true },
  DISMISSED: { bg: '#22c55e', c: '#fff' },
};

window.ESC_COL = {
  CASE_CREATED:      '#22c55e',
  SLACK_NOTIFIED:    '#3b82f6',
  WATCHLIST_FLAGGED: '#f59e0b',
  EMAIL_SENT:        '#a855f7',
  NO_ESCALATION:     '#525252',
};

window.fmtTime = function(ts) {
  return ts ? (ts.includes('T') ? ts.split('T')[1].slice(0, 8) : ts.slice(11, 19)) : '--';
};
window.fmtDate = function(ts) {
  return ts ? ts.replace('T', ' ').slice(0, 19) : '--';
};
window.fmtNum = function(n) {
  return Number(n || 0).toLocaleString('en-IN');
};
window.fmtRs = function(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
window.fmtK = function(n) {
  return n >= 1e7 ? (n / 1e7).toFixed(1) + 'Cr'
       : n >= 1e5 ? (n / 1e5).toFixed(1) + 'L'
       : window.fmtNum(n);
};
