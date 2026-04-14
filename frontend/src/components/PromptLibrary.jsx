import { API } from '../config.js'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Plus, Trash2, Star, Users, Cpu, X, BookOpen, ChevronRight, Edit3, Check } from 'lucide-react'



const CATEGORY_COLORS = {
  review:  { bg: '#1a0a2e', border: '#4a1a6e', text: '#c084fc' },
  code:    { bg: '#0a1a2e', border: '#1a3a5e', text: '#60a5fa' },
  docs:    { bg: '#0a2e1a', border: '#1a5e2a', text: '#4ade80' },
  general: { bg: '#1a1a0e', border: '#3a3a1e', text: '#facc15' },
  custom:  { bg: '#1a0e0e', border: '#3e1a1a', text: '#f87171' },
}

const SOURCE_ICONS = { builtin: Cpu, team: Users, personal: Star }

function CategoryBadge({ cat }) {
  const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS.general
  return (
    <span style={{ ...s.badge, background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      {cat}
    </span>
  )
}

function PromptRow({ prompt, selected, onSelect, onDelete, onEdit }) {
  const Icon = SOURCE_ICONS[prompt.source] || Star
  return (
    <button
      style={{ ...s.row, ...(selected ? s.rowSelected : {}) }}
      onClick={() => onSelect(prompt)}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#0d0d20' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={s.rowLeft}>
        <Icon size={11} color={selected ? '#a78bfa' : '#444'} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={s.rowInfo}>
          <div style={s.rowTitle}>
            {prompt.title}
            {prompt.shortcut && <code style={s.shortcutTag}>{prompt.shortcut}</code>}
          </div>
          <div style={s.rowDesc}>{prompt.description}</div>
        </div>
      </div>
      <div style={s.rowRight}>
        <CategoryBadge cat={prompt.category || 'general'} />
        {prompt.source === 'personal' && (
          <>
            <button style={s.actionBtn} onClick={e => { e.stopPropagation(); onEdit(prompt) }} title="Edit">
              <Edit3 size={11} color="#555" />
            </button>
            <button style={s.actionBtn} onClick={e => { e.stopPropagation(); onDelete(prompt.id) }} title="Delete">
              <Trash2 size={11} color="#f87171" />
            </button>
          </>
        )}
      </div>
    </button>
  )
}

function NewPromptForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    title: '', description: '', category: 'general', shortcut: '', prompt: '', tags: ''
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title.trim() || !form.prompt.trim()) return
    const payload = {
      ...form,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    onSave(payload)
  }

  return (
    <div style={s.formWrap}>
      <div style={s.formTitle}>{initial?.id ? 'Edit Prompt' : 'New Prompt'}</div>
      <div style={s.formGrid}>
        <input style={s.input} placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} />
        <input style={s.input} placeholder="Description" value={form.description} onChange={e => set('description', e.target.value)} />
        <div style={s.formRow}>
          <select style={{ ...s.input, flex: 1 }} value={form.category} onChange={e => set('category', e.target.value)}>
            {['general','code','review','docs','custom'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input style={{ ...s.input, flex: 1 }} placeholder="/shortcut (optional)" value={form.shortcut} onChange={e => set('shortcut', e.target.value)} />
        </div>
        <input style={s.input} placeholder="Tags (comma separated)" value={form.tags} onChange={e => set('tags', e.target.value)} />
        <textarea
          style={{ ...s.input, minHeight: 120, resize: 'vertical', fontFamily: "'Berkeley Mono', monospace", fontSize: 12 }}
          placeholder="Prompt text *"
          value={form.prompt}
          onChange={e => set('prompt', e.target.value)}
        />
      </div>
      <div style={s.formActions}>
        <button style={s.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={s.saveBtn} onClick={save}>
          <Check size={13} /> Save Prompt
        </button>
      </div>
    </div>
  )
}

export default function PromptLibrary({ onInsert, onClose }) {
  const [data,       setData]       = useState({ builtin: [], personal: [], team: [], all: [] })
  const [query,      setQuery]      = useState('')
  const [filter,     setFilter]     = useState('all')   // all | builtin | team | personal
  const [selected,   setSelected]   = useState(null)
  const [creating,   setCreating]   = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState(null)
  const searchRef = useRef(null)

  useEffect(() => {
    fetchPrompts()
    setTimeout(() => searchRef.current?.focus(), 80)
  }, [])

  const fetchPrompts = async () => {
    try {
      const r = await fetch(`${API}/prompts`)
      setData(await r.json())
    } catch {}
  }

  const filtered = useMemo(() => {
    let list = filter === 'all' ? data.all : (data[filter] || [])
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.shortcut?.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }, [data, query, filter])

  // Keyboard: arrow nav + Enter to insert
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (!filtered.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = filtered.indexOf(selected)
        setSelected(filtered[Math.min(idx + 1, filtered.length - 1)])
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = filtered.indexOf(selected)
        setSelected(filtered[Math.max(idx - 1, 0)])
      }
      if (e.key === 'Enter' && selected && !creating && !editing) {
        e.preventDefault()
        onInsert(selected.prompt)
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, selected, creating, editing, onInsert, onClose])

  const handleDelete = async (id) => {
    await fetch(`${API}/prompts/${id}`, { method: 'DELETE' })
    fetchPrompts()
    if (selected?.id === id) setSelected(null)
  }

  const handleSave = async (prompt) => {
    await fetch(`${API}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt),
    })
    fetchPrompts()
    setCreating(false)
    setEditing(null)
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const r = await fetch(`${API}/prompts/sync`, { method: 'POST' })
      const d = await r.json()
      setSyncMsg(d.ok ? `✓ Synced ${d.count} team prompts` : `✗ ${d.error}`)
      if (d.ok) fetchPrompts()
    } catch { setSyncMsg('✗ Sync failed') }
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 4000)
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div style={s.searchRow}>
            <Search size={14} color="#555" />
            <input
              ref={searchRef}
              style={s.searchInput}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(filtered[0] || null) }}
              placeholder="Search prompts… or type /shortcut"
            />
            {query && <button style={s.clearBtn} onClick={() => setQuery('')}><X size={12} /></button>}
          </div>
          <div style={s.headerActions}>
            <button style={s.iconBtn} onClick={handleSync} title="Sync team prompts" disabled={syncing}>
              <Users size={13} color={syncing ? '#7c6af7' : '#555'} />
            </button>
            <button style={s.iconBtn} onClick={() => { setCreating(true); setEditing(null) }} title="New prompt">
              <Plus size={13} color="#7c6af7" />
            </button>
            <button style={s.iconBtn} onClick={onClose}><X size={13} color="#555" /></button>
          </div>
        </div>

        {syncMsg && <div style={s.syncMsg}>{syncMsg}</div>}

        {/* ── Filter tabs ── */}
        <div style={s.tabs}>
          {['all','builtin','team','personal'].map(tab => (
            <button
              key={tab}
              style={{ ...s.tab, ...(filter === tab ? s.tabActive : {}) }}
              onClick={() => setFilter(tab)}
            >
              {tab === 'all'      && `All (${data.all?.length || 0})`}
              {tab === 'builtin'  && `Built-in (${data.builtin?.length || 0})`}
              {tab === 'team'     && `Team (${data.team?.length || 0})`}
              {tab === 'personal' && `Mine (${data.personal?.length || 0})`}
            </button>
          ))}
        </div>

        <div style={s.body}>
          {/* ── Form (create / edit) ── */}
          {(creating || editing) && (
            <NewPromptForm
              initial={editing}
              onSave={handleSave}
              onCancel={() => { setCreating(false); setEditing(null) }}
            />
          )}

          {/* ── List + Preview ── */}
          {!creating && !editing && (
            <div style={s.listPane}>
              <div style={s.list}>
                {filtered.length === 0 && (
                  <div style={s.empty}>
                    <BookOpen size={24} color="#333" />
                    <span>No prompts match "{query}"</span>
                    <button style={s.createHint} onClick={() => setCreating(true)}>
                      + Create one
                    </button>
                  </div>
                )}
                {filtered.map(p => (
                  <PromptRow
                    key={p.id}
                    prompt={p}
                    selected={selected?.id === p.id}
                    onSelect={p => setSelected(p)}
                    onDelete={handleDelete}
                    onEdit={p => { setEditing(p); setCreating(false) }}
                  />
                ))}
              </div>

              {/* ── Preview panel ── */}
              {selected && (
                <div style={s.preview}>
                  <div style={s.previewHeader}>
                    <div>
                      <div style={s.previewTitle}>{selected.title}</div>
                      <div style={s.previewMeta}>
                        <CategoryBadge cat={selected.category || 'general'} />
                        {selected.shortcut && <code style={s.shortcutTag}>{selected.shortcut}</code>}
                        <span style={s.sourceTag}>{selected.source}</span>
                      </div>
                    </div>
                    <button
                      style={s.insertBtn}
                      onClick={() => { onInsert(selected.prompt); onClose() }}
                    >
                      Insert <ChevronRight size={13} />
                    </button>
                  </div>
                  <pre style={s.previewBody}>{selected.prompt}</pre>
                  {selected.tags?.length > 0 && (
                    <div style={s.tagRow}>
                      {selected.tags.map(t => (
                        <span key={t} style={s.tag}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={s.footer}>
          <span>↑↓ navigate</span>
          <span>Enter insert</span>
          <span>Esc close</span>
          <span style={{ marginLeft: 'auto', color: '#333' }}>
            {filtered.length} prompt{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: '8vh', zIndex: 200, backdropFilter: 'blur(6px)',
  },
  panel: {
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 14,
    width: 800, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 14px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1)',
  },
  searchRow: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 8, padding: '6px 10px',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', color: 'var(--tx)', outline: 'none',
    fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  },
  clearBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', padding: 2, display: 'flex' },
  headerActions: { display: 'flex', gap: 6 },
  iconBtn: { background: 'none', border: '1px solid var(--bd)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex' },
  syncMsg: { padding: '6px 14px', fontSize: 11, color: '#4ade80', background: '#0a140a', borderBottom: '1px solid #1a3a1a', fontFamily: "'Berkeley Mono', monospace" },

  tabs: {
    display: 'flex', gap: 0, padding: '0 14px',
    borderBottom: '1px solid var(--bd)', background: 'var(--bg)',
  },
  tab: {
    padding: '8px 14px', fontSize: 11, cursor: 'pointer', border: 'none',
    background: 'none', color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace",
    borderBottom: '2px solid transparent', transition: 'all 0.15s',
  },
  tabActive: { color: 'var(--ac2)', borderBottomColor: 'var(--ac)' },

  body: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

  listPane: { flex: 1, display: 'flex', overflow: 'hidden' },
  list: { width: 340, borderRight: '1px solid var(--bd)', overflowY: 'auto', flexShrink: 0 },

  row: {
    width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
    textAlign: 'left', borderBottom: '1px solid var(--bd)', transition: 'background 0.1s', gap: 8,
  },
  rowSelected: { background: 'var(--bg3)', borderLeft: '2px solid var(--ac)' },
  rowLeft: { display: 'flex', gap: 8, flex: 1, overflow: 'hidden', alignItems: 'flex-start' },
  rowInfo: { display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' },
  rowTitle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx2)', fontWeight: 500, fontFamily: "'DM Sans', sans-serif" },
  rowDesc:  { fontSize: 11, color: 'var(--tx4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif" },
  rowRight: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  actionBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex', opacity: 0.6 },

  badge: { fontSize: 9, padding: '1px 6px', borderRadius: 10, fontFamily: "'Berkeley Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.5 },
  shortcutTag: { fontSize: 10, background: 'var(--bg5)', border: '1px solid var(--bd2)', borderRadius: 4, padding: '1px 5px', color: 'var(--ac)', fontFamily: "'Berkeley Mono', monospace" },
  sourceTag: { fontSize: 10, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace" },

  preview: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', borderBottom: '1px solid var(--bd)' },
  previewTitle: { fontSize: 14, fontWeight: 600, color: 'var(--tx)', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" },
  previewMeta:  { display: 'flex', alignItems: 'center', gap: 6 },
  previewBody:  {
    flex: 1, overflowY: 'auto', padding: '14px 16px', fontSize: 12, lineHeight: 1.7,
    color: 'var(--tx3)', fontFamily: "'Berkeley Mono', monospace", whiteSpace: 'pre-wrap',
    wordBreak: 'break-word', background: 'var(--bg)',
  },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5, padding: '10px 16px', borderTop: '1px solid var(--bd)' },
  tag: { fontSize: 10, color: 'var(--tx4)', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 10, padding: '2px 8px', fontFamily: "'Berkeley Mono', monospace" },
  insertBtn: {
    display: 'flex', alignItems: 'center', gap: 4, background: 'var(--ac)',
    border: 'none', color: '#fff', borderRadius: 8, padding: '6px 14px',
    cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, flexShrink: 0,
  },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 20px', color: 'var(--tx5)', fontSize: 13 },
  createHint: { background: 'none', border: '1px dashed var(--bd2)', color: 'var(--ac)', padding: '6px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 12, marginTop: 4 },

  formWrap: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' },
  formTitle: { fontSize: 13, fontWeight: 600, color: 'var(--tx)', fontFamily: "'DM Sans', sans-serif", marginBottom: 4 },
  formGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  formRow:  { display: 'flex', gap: 8 },
  input: {
    width: '100%', background: 'var(--bg3)', color: 'var(--tx2)', border: '1px solid var(--bd2)',
    borderRadius: 7, padding: '8px 11px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
  },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cancelBtn: { background: 'none', border: '1px solid var(--bd2)', color: 'var(--tx3)', borderRadius: 7, padding: '7px 16px', cursor: 'pointer', fontSize: 12 },
  saveBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ac)', border: 'none', color: '#fff', borderRadius: 7, padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500 },

  footer: {
    display: 'flex', gap: 16, padding: '8px 14px',
    borderTop: '1px solid var(--bd)', background: 'var(--bg)',
    fontSize: 10, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace",
  },
}
