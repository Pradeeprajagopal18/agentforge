import { API, STORAGE_PINS_KEY } from '../config.js'
import React, { useState, useMemo, useEffect } from 'react'
import { Plus, Trash2, MessageSquare, Settings, Star, GitBranch, Search, X, Circle } from 'lucide-react'


const PINS_KEY = 'agentforge:pinned'

function loadPins() {
  try { return new Set(JSON.parse(localStorage.getItem(PINS_KEY) || '[]')) }
  catch { return new Set() }
}
function savePins(set) {
  localStorage.setItem(PINS_KEY, JSON.stringify([...set]))
}

export default function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, onSettings, onBranch }) {
  const [search,     setSearch]     = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [pinned,     setPinned]     = useState(loadPins)
  const [backendOk,  setBackendOk]  = useState(null)

  // Backend health pulse every 10s
  useEffect(() => {
    const check = () => {
      fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) })
        .then(r => setBackendOk(r.ok))
        .catch(() => setBackendOk(false))
    }
    check()
    const t = setInterval(check, 10000)
    return () => clearInterval(t)
  }, [])

  const togglePin = (id, e) => {
    e.stopPropagation()
    setPinned(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      savePins(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(c => c.title?.toLowerCase().includes(q))
  }, [conversations, search])

  const pinnedConvs  = filtered.filter(c => pinned.has(c.id))
  const regularConvs = filtered.filter(c => !pinned.has(c.id))

  const renderConv = (conv) => {
    const isPinned = pinned.has(conv.id)
    const isActive = conv.id === activeId
    const isBranch = !!conv.parent_id
    return (
      <div
        key={conv.id}
        style={{ ...s.item, ...(isActive ? s.itemActive : {}) }}
        onClick={() => onSelect(conv.id)}
        title={conv.title || 'Untitled'}
        className="sidebar-item"
      >
        {isBranch
          ? <GitBranch size={12} color={isActive ? 'var(--ac2)' : 'var(--bd3)'} style={{ flexShrink:0 }} />
          : <MessageSquare size={12} color={isActive ? 'var(--ac)' : 'var(--tx4)'} style={{ flexShrink:0 }} />
        }
        <div style={s.itemContent}>
          <span style={{ ...s.title, ...(isBranch ? s.branchTitle : {}) }}>
            {conv.title || 'Untitled'}
          </span>
          {conv.updated_at && <span style={s.timestamp}>{formatTime(conv.updated_at)}</span>}
        </div>
        <div style={s.itemActions} className="item-actions">
          <button style={{ ...s.iconBtn, opacity: isPinned ? 1 : 0 }} onClick={e => togglePin(conv.id, e)} title={isPinned ? 'Unpin' : 'Pin'}>
            <Star size={10} color="#facc15" fill={isPinned ? '#facc15' : 'none'} />
          </button>
          <button style={{ ...s.iconBtn, opacity: 0 }} onClick={e => { e.stopPropagation(); onDelete(conv.id) }} title="Delete" className="del-btn">
            <Trash2 size={10} color="#f87171" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.sidebar}>
      <div style={s.header}>
        {showSearch ? (
          <div style={s.searchRow}>
            <Search size={12} color="var(--tx4)" />
            <input style={s.searchInput} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…" autoFocus onKeyDown={e => e.key === 'Escape' && (setShowSearch(false), setSearch(''))} />
            <button style={s.iconBtn} onClick={() => { setShowSearch(false); setSearch('') }}>
              <X size={12} color="var(--tx4)" />
            </button>
          </div>
        ) : (
          <>
            <span style={s.logo}>⬡ AgentForge</span>
            <div style={s.headerBtns}>
              <button style={s.headerBtn} onClick={() => setShowSearch(true)} title="Search (⌘F)"><Search size={13} /></button>
              <button style={s.headerBtn} onClick={onNew} title="New conversation (⌘K)"><Plus size={14} /></button>
            </div>
          </>
        )}
      </div>

      <div style={s.list}>
        {filtered.length === 0 && (
          <div style={s.empty}>{search ? `No results for "${search}"` : 'No conversations yet'}</div>
        )}
        {pinnedConvs.length > 0 && (
          <>
            <div style={s.sectionLabel}><Star size={9} color="#facc15" fill="#facc15" /> Pinned</div>
            {pinnedConvs.map(renderConv)}
            {regularConvs.length > 0 && <div style={s.divider} />}
          </>
        )}
        {regularConvs.length > 0 && (
          <>
            {pinnedConvs.length > 0 && <div style={s.sectionLabel}>Recent</div>}
            {regularConvs.map(renderConv)}
          </>
        )}
      </div>

      <div style={s.footer}>
        <div style={s.healthRow}>
          <Circle size={7}
            color={backendOk === null ? 'var(--tx4)' : backendOk ? '#4ade80' : '#f87171'}
            fill={backendOk === null ? 'var(--tx4)' : backendOk ? '#4ade80' : '#f87171'}
          />
          <span style={{ ...s.footerText, color: backendOk === false ? '#f87171' : 'var(--tx5)' }}>
            {backendOk === null ? 'connecting…' : backendOk ? 'backend ok' : 'backend down'}
          </span>
        </div>
        <button style={s.settingsBtn} onClick={onSettings} title="Settings (⌘,)">
          <Settings size={13} color="var(--tx4)" />
        </button>
      </div>

      <style>{`
        .sidebar-item:hover { background: var(--bg4) !important; }
        .sidebar-item:hover .item-actions .del-btn { opacity: 1 !important; }
        .sidebar-item:hover .item-actions button:first-child { opacity: 0.7 !important; }
      `}</style>
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso)
  if (diff < 60000)     return 'now'
  if (diff < 3600000)   return `${Math.floor(diff/60000)}m`
  if (diff < 86400000)  return `${Math.floor(diff/3600000)}h`
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d`
  return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' })
}

const s = {
  sidebar: { width:230, background:'var(--bg1)', borderRight:'1px solid var(--bd)', display:'flex', flexDirection:'column', flexShrink:0, height:'100vh', userSelect:'none' },
  header:  { padding:'11px 10px', borderBottom:'1px solid var(--bd)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 },
  logo:    { fontSize:12, color:'var(--ac)', fontFamily:"'Berkeley Mono',monospace", fontWeight:600 },
  headerBtns: { display:'flex', gap:4 },
  headerBtn:  { background:'none', border:'1px solid var(--bd)', borderRadius:6, cursor:'pointer', padding:'4px 7px', display:'flex', alignItems:'center', color:'var(--tx3)' },
  searchRow:  { flex:1, display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', border:'1px solid var(--bd2)', borderRadius:7, padding:'5px 8px' },
  searchInput:{ flex:1, background:'none', border:'none', color:'var(--tx)', outline:'none', fontSize:12, fontFamily:"'DM Sans',sans-serif" },
  iconBtn:    { background:'none', border:'none', cursor:'pointer', padding:'2px 3px', display:'flex', alignItems:'center' },

  list:     { flex:1, overflowY:'auto', padding:'6px 5px', display:'flex', flexDirection:'column', gap:1 },
  empty:    { color:'var(--tx5)', fontSize:11, textAlign:'center', padding:'20px 8px', fontFamily:"'Berkeley Mono',monospace", lineHeight:1.5 },
  sectionLabel: { display:'flex', alignItems:'center', gap:5, fontSize:9, color:'var(--tx4)', textTransform:'uppercase', letterSpacing:1, fontFamily:"'Berkeley Mono',monospace", padding:'6px 8px 3px' },
  divider:  { height:1, background:'var(--bd)', margin:'4px 8px' },

  item:       { display:'flex', alignItems:'center', gap:7, padding:'7px 8px', borderRadius:7, cursor:'pointer', transition:'background 0.12s', border:'1px solid transparent', position:'relative' },
  itemActive: { background:'var(--bg4)', borderColor:'var(--bd3)' },
  itemContent:{ flex:1, display:'flex', flexDirection:'column', gap:1, overflow:'hidden', minWidth:0 },
  title:      { fontSize:12, color:'var(--tx2)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', fontFamily:"'DM Sans',sans-serif" },
  branchTitle:{ color:'var(--ac2)', fontStyle:'italic' },
  timestamp:  { fontSize:9, color:'var(--tx5)', fontFamily:"'Berkeley Mono',monospace" },
  itemActions:{ display:'flex', alignItems:'center', gap:2, flexShrink:0 },

  footer:     { padding:'8px 10px', borderTop:'1px solid var(--bd)', display:'flex', alignItems:'center', justifyContent:'space-between' },
  healthRow:  { display:'flex', alignItems:'center', gap:5 },
  footerText: { fontSize:9, fontFamily:"'Berkeley Mono',monospace" },
  settingsBtn:{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', alignItems:'center' },
}
