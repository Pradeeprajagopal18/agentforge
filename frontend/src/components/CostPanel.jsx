import { API } from '../config.js'
import React, { useState, useEffect } from 'react'
import { DollarSign, Zap, X, BarChart2 } from 'lucide-react'


function Stat({ label, value, color = 'var(--ac)' }) {
  return (
    <div style={s.stat}>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

function Bar({ label, value, max, color }) {
  const pct  = max ? Math.min(100, (value / max) * 100) : 0
  const warn = pct > 80
  return (
    <div style={s.barRow}>
      <div style={s.barLabel}>{label}</div>
      <div style={s.barTrack}>
        <div style={{ ...s.barFill, width: `${pct}%`, background: warn ? '#f59e0b' : color }} />
      </div>
      <div style={s.barValue}>{value?.toLocaleString()}</div>
    </div>
  )
}

export default function CostPanel({ convId, messages, onClose }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!convId) return
    fetch(`${API}/conversations/${convId}/stats`)
      .then(r => r.json()).then(setStats).catch(() => {})
  }, [convId, messages.length])

  const derived = React.useMemo(() => {
    const costMsgs = messages.filter(m => m.cost && m.cost > 0)
    const total = costMsgs.reduce((sum, m) => sum + (m.cost || 0), 0)
    return {
      total_cost: total,
      turn_count: messages.filter(m => m.role === 'assistant').length,
      avg_cost: costMsgs.length ? total / costMsgs.length : 0,
    }
  }, [messages])

  const data = stats || derived

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <BarChart2 size={14} color="var(--ac)" />
          <span style={s.title}>Usage & Cost</span>
        </div>
        <button style={s.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>

      <div style={s.body}>
        <div style={s.statRow}>
          <Stat label="Session Cost" color="#4ade80"
            value={data.total_cost < 0.001 ? '< $0.001' : `$${data.total_cost.toFixed(4)}`} />
          <Stat label="Turns"        color="#60a5fa" value={data.turn_count || 0} />
          <Stat label="Avg / Turn"   color="var(--ac2)"
            value={data.avg_cost ? `$${data.avg_cost.toFixed(4)}` : '—'} />
        </div>

        {messages.filter(m => m.role === 'assistant' && m.cost).length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Cost per turn</div>
            <div style={s.timeline}>
              {messages.filter(m => m.role === 'assistant').map((m, i) => (
                <div key={i} style={s.timelineRow}>
                  <span style={s.turnNum}>#{i + 1}</span>
                  <div style={s.timelineBar}>
                    <div style={{ ...s.timelineBarFill, width: `${Math.min(100, ((m.cost || 0) / 0.05) * 100)}%` }} />
                  </div>
                  <span style={s.turnCost}>{m.cost ? `$${m.cost.toFixed(4)}` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats?.input_tokens !== undefined && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Token breakdown</div>
            <Bar label="Input"  value={stats.input_tokens}  max={200000} color="#60a5fa" />
            <Bar label="Output" value={stats.output_tokens} max={200000} color="var(--ac2)" />
            {stats.cache_tokens > 0 &&
              <Bar label="Cached" value={stats.cache_tokens} max={200000} color="#34d399" />}
          </div>
        )}

        {stats?.context_pct !== undefined && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Context window</div>
            <div style={s.contextBar}>
              <div style={{ ...s.contextFill, width: `${stats.context_pct}%`,
                background: stats.context_pct > 80 ? '#f59e0b' : stats.context_pct > 60 ? 'var(--ac2)' : 'var(--ac)'
              }} />
            </div>
            <div style={s.contextLabel}>
              {stats.context_pct.toFixed(1)}% of context window used
              {stats.context_pct > 80 && <span style={s.warn}> — approaching limit</span>}
            </div>
          </div>
        )}

        <div style={s.footer}>
          <Zap size={11} color="var(--tx5)" />
          <span style={s.footerNote}>Costs are estimates based on Claude API pricing</span>
        </div>
      </div>
    </div>
  )
}

const s = {
  panel: {
    position: 'absolute', bottom: 60, right: 16, width: 320,
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 12,
    boxShadow: '0 16px 48px rgba(0,0,0,0.3)', zIndex: 50, overflow: 'hidden'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '11px 14px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 7 },
  title:    { fontSize: 12, fontWeight: 600, color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif" },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', padding: 2 },

  body: { padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 },

  statRow: { display: 'flex', gap: 0, borderRadius: 9, overflow: 'hidden', border: '1px solid var(--bd)' },
  stat: { flex: 1, padding: '10px 12px', background: 'var(--bg1)', borderRight: '1px solid var(--bd)', textAlign: 'center' },
  statValue: { fontSize: 16, fontWeight: 700, fontFamily: "'Berkeley Mono', monospace" },
  statLabel: { fontSize: 10, color: 'var(--tx4)', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: "'Berkeley Mono', monospace" },

  section:      { display: 'flex', flexDirection: 'column', gap: 7 },
  sectionTitle: { fontSize: 10, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: "'Berkeley Mono', monospace" },

  barRow:   { display: 'flex', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 11, color: 'var(--tx3)', width: 50, fontFamily: "'Berkeley Mono', monospace" },
  barTrack: { flex: 1, height: 5, background: 'var(--bg5)', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 3, transition: 'width 0.4s ease' },
  barValue: { fontSize: 10, color: 'var(--tx4)', width: 60, textAlign: 'right', fontFamily: "'Berkeley Mono', monospace" },

  timeline:        { display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 160, overflowY: 'auto' },
  timelineRow:     { display: 'flex', alignItems: 'center', gap: 8 },
  turnNum:         { fontSize: 10, color: 'var(--tx4)', width: 22, fontFamily: "'Berkeley Mono', monospace" },
  timelineBar:     { flex: 1, height: 4, background: 'var(--bg5)', borderRadius: 2, overflow: 'hidden' },
  timelineBarFill: { height: '100%', background: 'var(--ac)', borderRadius: 2, transition: 'width 0.3s' },
  turnCost:        { fontSize: 10, color: 'var(--ac2)', width: 54, textAlign: 'right', fontFamily: "'Berkeley Mono', monospace" },

  contextBar:   { height: 8, background: 'var(--bg5)', borderRadius: 4, overflow: 'hidden' },
  contextFill:  { height: '100%', borderRadius: 4, transition: 'width 0.4s ease, background 0.3s' },
  contextLabel: { fontSize: 11, color: 'var(--tx3)', fontFamily: "'Berkeley Mono', monospace" },
  warn:         { color: '#f59e0b' },

  footer:     { display: 'flex', alignItems: 'center', gap: 5, paddingTop: 4, borderTop: '1px solid var(--bd)' },
  footerNote: { fontSize: 10, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace" },
}
