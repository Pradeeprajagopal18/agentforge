import { API } from '../config.js'
import React, { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X } from 'lucide-react'



export default function ConversationTitle({ convId, title, onRenamed }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState(title || '')
  const [saving,  setSaving]  = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setValue(title || '') }, [title])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const save = async () => {
    if (!value.trim() || value === title) { setEditing(false); return }
    setSaving(true)
    try {
      await fetch(`${API}/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: value.trim() })
      })
      onRenamed?.(value.trim())
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  const cancel = () => { setValue(title || ''); setEditing(false) }

  if (editing) {
    return (
      <div style={s.editRow}>
        <input
          ref={inputRef}
          style={s.input}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          maxLength={120}
        />
        <button style={s.iconBtn} onClick={save} disabled={saving} title="Save">
          <Check size={13} color="#4ade80" />
        </button>
        <button style={s.iconBtn} onClick={cancel} title="Cancel">
          <X size={13} color="#f87171" />
        </button>
      </div>
    )
  }

  return (
    <div style={s.row}>
      <span style={s.title} title={title}>{title || 'New conversation'}</span>
      <button style={s.editBtn} onClick={() => setEditing(true)} title="Rename">
        <Pencil size={11} color="#444" />
      </button>
    </div>
  )
}

const s = {
  row: { display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', flex: 1 },
  title: { fontSize: 13, color: 'var(--tx4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  editBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.6 },
  editRow: { display: 'flex', alignItems: 'center', gap: 5, flex: 1 },
  input: {
    flex: 1, background: 'var(--bg3)', color: 'var(--tx)', border: '1px solid var(--bd3)',
    borderRadius: 6, padding: '3px 8px', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none'
  },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' },
}
