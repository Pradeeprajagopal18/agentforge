import { API } from '../config.js'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, FolderOpen, Image, Code, BookOpen } from 'lucide-react'



const EXT_ICONS = {
  py:Code, js:Code, ts:Code, jsx:Code, tsx:Code,
  go:Code, rs:Code, java:Code, cpp:Code, c:Code,
  md:FileText, txt:FileText, json:FileText, yaml:FileText, toml:FileText,
  png:Image, jpg:Image, jpeg:Image, gif:Image, webp:Image,
}
function FileIcon({ name }) {
  const Icon = EXT_ICONS[name?.split('.')?.pop()?.toLowerCase()] || FileText
  return <Icon size={12} color="var(--ac)" />
}

export default function SmartInput({ value, onChange, onKeyDown, disabled, placeholder, inputRef, onMentionAttach }) {
  const [mode,        setMode]        = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [queryStart,  setQueryStart]  = useState(-1)
  const [loading,     setLoading]     = useState(false)
  const dropdownRef = useRef(null)

  const handleChange = useCallback((e) => {
    const val = e.target.value
    const pos = e.target.selectionStart
    const before = val.slice(0, pos)

    const atMatch = before.match(/@([\w./\-]*)$/)
    if (atMatch) {
      setMode('file'); setQueryStart(atMatch.index); setSelectedIdx(0)
      fetchFiles(atMatch[1])
      onChange(e); return
    }

    const slashMatch = before.match(/(?:^|\s)\/([\w]*)$/)
    if (slashMatch) {
      setMode('prompt'); setQueryStart(before.lastIndexOf('/') ); setSelectedIdx(0)
      fetchPrompts(slashMatch[1])
      onChange(e); return
    }

    setMode(null)
    onChange(e)
  }, [onChange])

  const fetchFiles = async (q) => {
    setLoading(true)
    try {
      const r = await fetch(`${API}/files/search?q=${encodeURIComponent(q)}&limit=8`)
      setSuggestions((await r.json()).files || [])
    } catch { setSuggestions([]) }
    setLoading(false)
  }

  const fetchPrompts = async (q) => {
    setLoading(true)
    try {
      const r    = await fetch(`${API}/prompts`)
      const data = await r.json()
      const all  = data.all || []
      const filtered = q
        ? all.filter(p => p.shortcut?.slice(1).startsWith(q) || p.title.toLowerCase().includes(q.toLowerCase()))
        : all.slice(0, 8)
      setSuggestions(filtered)
    } catch { setSuggestions([]) }
    setLoading(false)
  }

  const pickFile = async (file) => {
    setMode(null)
    const before  = value.slice(0, queryStart)
    const after   = value.slice(inputRef.current.selectionStart)
    onChange({ target: { value: before + `@${file.name} ` + after } })
    try {
      const r = await fetch(`${API}/files/read?path=${encodeURIComponent(file.path)}`)
      const d = await r.json()
      if (d.content !== undefined)
        onMentionAttach({ name:file.name, type:'file', media_type:'text/plain', content:d.content, path:file.path })
    } catch {}
    inputRef.current?.focus()
  }

  const pickPrompt = (prompt) => {
    setMode(null)
    const before = value.slice(0, queryStart)
    const after  = value.slice(inputRef.current.selectionStart)
    const sep    = before && !before.endsWith('\n') ? '\n\n' : ''
    onChange({ target: { value: before.trimEnd() + sep + prompt.prompt + after } })
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (mode && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i+1, suggestions.length-1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i-1, 0)); return }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const s = suggestions[selectedIdx]
        if (s) { e.preventDefault(); mode === 'file' ? pickFile(s) : pickPrompt(s); return }
      }
      if (e.key === 'Escape') { setMode(null); return }
    }
    onKeyDown(e)
  }

  const isPromptMode = mode === 'prompt'
  const isFileMode   = mode === 'file'

  return (
    <div style={s.wrap}>
      <textarea
        ref={inputRef}
        style={s.textarea}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
      />

      {mode && (
        <div ref={dropdownRef} style={s.dropdown}>
          <div style={s.dropHeader}>
            <span style={s.dropLabel}>
              {isFileMode ? '@ Files' : '/ Prompts'}
            </span>
            {loading && <span style={s.dropLoading}>searching…</span>}
          </div>
          {suggestions.length === 0 && !loading && (
            <div style={s.dropEmpty}>No matches found</div>
          )}
          {suggestions.map((item, i) => (
            <button
              key={isFileMode ? item.path : item.id}
              style={{ ...s.dropItem, ...(i === selectedIdx ? s.dropItemActive : {}) }}
              onClick={() => isFileMode ? pickFile(item) : pickPrompt(item)}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {isFileMode ? (
                <>
                  <FileIcon name={item.name} />
                  <div style={s.dropInfo}>
                    <span style={s.dropName}>{item.name}</span>
                    <span style={s.dropPath}>{item.path}</span>
                  </div>
                  {item.size_kb && <span style={s.dropSize}>{item.size_kb}kb</span>}
                </>
              ) : (
                <>
                  <BookOpen size={12} color="var(--ac)" />
                  <div style={s.dropInfo}>
                    <span style={s.dropName}>
                      {item.title}
                      {item.shortcut && <code style={s.shortcutCode}>{item.shortcut}</code>}
                    </span>
                    <span style={s.dropPath}>{item.description}</span>
                  </div>
                  <span style={{ ...s.dropSize, color: categoryColor(item.category) }}>{item.category}</span>
                </>
              )}
            </button>
          ))}
          <div style={s.dropFooter}>↑↓ navigate · Tab/Enter select · Esc dismiss</div>
        </div>
      )}
    </div>
  )
}

const categoryColor = (c) => ({ review:'#c084fc', code:'#60a5fa', docs:'#4ade80', general:'#facc15' }[c] || 'var(--tx3)')

const s = {
  wrap: { position:'relative', flex:1 },
  textarea: {
    width:'100%', background:'var(--bg3)', color:'var(--tx)',
    border:'1px solid var(--bd2)', borderRadius:10, padding:'10px 14px', fontSize:14,
    fontFamily:"'DM Sans',sans-serif", resize:'none', outline:'none',
    lineHeight:1.5, boxSizing:'border-box',
  },
  dropdown: {
    position:'absolute', bottom:'calc(100% + 8px)', left:0,
    width:'100%', maxWidth:440, background:'var(--bg2)',
    border:'1px solid var(--bd2)', borderRadius:10,
    boxShadow:'0 12px 40px rgba(0,0,0,0.3)', overflow:'hidden', zIndex:99,
  },
  dropHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 12px', background:'var(--bg1)', borderBottom:'1px solid var(--bd)' },
  dropLabel:  { fontSize:10, color:'var(--ac)', fontFamily:"'Berkeley Mono',monospace", textTransform:'uppercase', letterSpacing:1 },
  dropLoading:{ fontSize:10, color:'var(--tx4)', fontFamily:"'Berkeley Mono',monospace" },
  dropEmpty:  { padding:'12px', fontSize:12, color:'var(--tx4)', textAlign:'center', fontFamily:"'Berkeley Mono',monospace" },
  dropItem:   { width:'100%', display:'flex', alignItems:'center', gap:9, padding:'8px 12px', background:'none', border:'none', cursor:'pointer', textAlign:'left', transition:'background 0.1s' },
  dropItemActive: { background:'var(--bg4)' },
  dropInfo:   { flex:1, display:'flex', flexDirection:'column', gap:1, overflow:'hidden' },
  dropName:   { fontSize:12, color:'var(--tx)', fontFamily:"'Berkeley Mono',monospace", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 },
  dropPath:   { fontSize:10, color:'var(--tx4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Berkeley Mono',monospace" },
  dropSize:   { fontSize:10, color:'var(--tx4)', fontFamily:"'Berkeley Mono',monospace", flexShrink:0 },
  dropFooter: { padding:'5px 12px', fontSize:10, color:'var(--tx5)', fontFamily:"'Berkeley Mono',monospace", borderTop:'1px solid var(--bd)', background:'var(--bg)' },
  shortcutCode: { fontSize:10, background:'var(--bg5)', border:'1px solid var(--bd2)', borderRadius:4, padding:'1px 5px', color:'var(--ac)', fontFamily:"'Berkeley Mono',monospace" },
}
