import { API } from '../config.js'
import React, { useState, useEffect, useRef } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check, Download, FolderOpen, GitBranch, ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { diffLines } from '../utils/artifactDetector.js'
import { useTheme } from '../ThemeContext.jsx'



function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setDone(true); setTimeout(() => setDone(false), 2000)
  }
  return (
    <button style={s.actionBtn} onClick={copy} title="Copy">
      {done ? <Check size={12} color="#4ade80" /> : <Copy size={12} color="#888" />}
    </button>
  )
}

function DiffView({ original, updated }) {
  const diff = diffLines(original || '', updated)
  return (
    <div style={s.diffView}>
      {diff.map((line, i) => (
        <div key={i} style={{
          ...s.diffLine,
          ...(line.type === 'add'    ? s.diffAdd    : {}),
          ...(line.type === 'remove' ? s.diffRemove : {}),
          ...(line.type === 'same'   ? s.diffSame   : {}),
        }}>
          <span style={s.diffMark}>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span style={s.diffLineNum}>{line.num}</span>
          <span style={s.diffCode}>{line.line}</span>
        </div>
      ))}
    </div>
  )
}

export default function ArtifactsPanel({ artifacts, onClose, streaming }) {
  const { mode } = useTheme()
  const hlTheme  = mode === 'light' ? oneLight : oneDark
  const [activeIdx,  setActiveIdx]  = useState(0)
  const [view,       setView]       = useState('code')  // 'code' | 'diff'
  const [expanded,   setExpanded]   = useState(false)
  const [origCode,   setOrigCode]   = useState('')
  const [applying,   setApplying]   = useState(false)
  const [applyMsg,   setApplyMsg]   = useState(null)
  const [savedFiles, setSavedFiles] = useState({})   // artifactId → saved path

  const artifact = artifacts[activeIdx]

  useEffect(() => {
    setActiveIdx(Math.min(activeIdx, Math.max(0, artifacts.length - 1)))
  }, [artifacts.length])

  if (!artifact) return null

  const applyToFile = async () => {
    // Ask user to pick a path via prompt (could be enhanced with a real file picker)
    const path = window.prompt(
      'Apply to file path (relative to working directory):',
      savedFiles[artifact.id] || suggestFilename(artifact.lang)
    )
    if (!path) return

    setApplying(true); setApplyMsg(null)
    try {
      const r = await fetch(`${API}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: artifact.code }),
      })
      const d = await r.json()
      if (d.ok) {
        setApplyMsg({ ok: true, text: `✓ Written to ${path}` })
        setSavedFiles(prev => ({ ...prev, [artifact.id]: path }))
      } else {
        setApplyMsg({ ok: false, text: `✗ ${d.error}` })
      }
    } catch (e) {
      setApplyMsg({ ok: false, text: `✗ ${e.message}` })
    }
    setApplying(false)
    setTimeout(() => setApplyMsg(null), 4000)
  }

  const downloadFile = () => {
    const blob = new Blob([artifact.code], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = suggestFilename(artifact.lang)
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ ...s.panel, ...(expanded ? s.panelExpanded : {}) }}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.panelLabel}>Artifacts</span>
          {artifacts.length > 1 && (
            <div style={s.tabRow}>
              {artifacts.map((a, i) => (
                <button
                  key={a.id}
                  style={{ ...s.tab, ...(i === activeIdx ? s.tabActive : {}) }}
                  onClick={() => setActiveIdx(i)}
                >
                  {a.title}
                  {streaming && i === artifacts.length - 1 && (
                    <span style={s.streamDot} />
                  )}
                </button>
              ))}
            </div>
          )}
          {artifacts.length === 1 && (
            <span style={s.artifactTitle}>
              {artifact.title}
              {streaming && <span style={s.streamDot} />}
            </span>
          )}
        </div>
        <div style={s.headerRight}>
          {/* View toggle */}
          <div style={s.viewToggle}>
            <button style={{ ...s.viewBtn, ...(view === 'code' ? s.viewBtnActive : {}) }} onClick={() => setView('code')}>
              Code
            </button>
            <button style={{ ...s.viewBtn, ...(view === 'diff' ? s.viewBtnActive : {}) }} onClick={() => { setView('diff'); if (!origCode) setOrigCode('') }}>
              <GitBranch size={11} /> Diff
            </button>
          </div>
          <CopyBtn text={artifact.code} />
          <button style={s.actionBtn} onClick={downloadFile} title="Download">
            <Download size={12} color="#888" />
          </button>
          <button style={s.actionBtn} onClick={applyToFile} title="Apply to file" disabled={applying}>
            <FolderOpen size={12} color={applying ? '#7c6af7' : '#888'} />
          </button>
          <button style={s.actionBtn} onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <Minimize2 size={12} color="#888" /> : <Maximize2 size={12} color="#888" />}
          </button>
          <button style={s.actionBtn} onClick={onClose} title="Close panel">
            <X size={12} color="#888" />
          </button>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={s.statusBar}>
        <span style={s.langTag}>{artifact.lang}</span>
        <span style={s.lineCount}>{artifact.code.split('\n').length} lines</span>
        {savedFiles[artifact.id] && (
          <span style={s.savedTag}>→ {savedFiles[artifact.id]}</span>
        )}
        {applyMsg && (
          <span style={{ ...s.applyMsg, color: applyMsg.ok ? '#4ade80' : '#f87171' }}>
            {applyMsg.text}
          </span>
        )}
        {streaming && <span style={s.streamingTag}>● streaming</span>}
      </div>

      {/* ── Diff input (if diff view) ── */}
      {view === 'diff' && (
        <div style={s.diffInputRow}>
          <span style={s.diffInputLabel}>Original:</span>
          <textarea
            style={s.diffInput}
            value={origCode}
            onChange={e => setOrigCode(e.target.value)}
            placeholder="Paste original code here to see diff…"
            rows={3}
          />
        </div>
      )}

      {/* ── Code / Diff view ── */}
      <div style={s.codeArea}>
        {view === 'code' ? (
          <SyntaxHighlighter
            style={hlTheme}
            language={artifact.lang}
            showLineNumbers
            wrapLongLines={false}
            customStyle={s.highlighter}
            lineNumberStyle={{ color: '#2a2a3e', fontSize: 11, minWidth: 36 }}
          >
            {artifact.code}
          </SyntaxHighlighter>
        ) : (
          <DiffView original={origCode} updated={artifact.code} />
        )}
      </div>

      {/* ── Multi-artifact navigation ── */}
      {artifacts.length > 1 && (
        <div style={s.navBar}>
          <button style={s.navBtn} onClick={() => setActiveIdx(i => Math.max(0, i - 1))} disabled={activeIdx === 0}>
            <ChevronLeft size={13} />
          </button>
          <span style={s.navCount}>{activeIdx + 1} / {artifacts.length}</span>
          <button style={s.navBtn} onClick={() => setActiveIdx(i => Math.min(artifacts.length - 1, i + 1))} disabled={activeIdx === artifacts.length - 1}>
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function suggestFilename(lang) {
  const ext = { python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts',
    ts: 'ts', jsx: 'jsx', tsx: 'tsx', bash: 'sh', sh: 'sh', sql: 'sql',
    yaml: 'yaml', yml: 'yml', json: 'json', go: 'go', rust: 'rs', dockerfile: 'Dockerfile',
    terraform: 'tf', html: 'html', css: 'css', markdown: 'md',
  }
  return `output.${ext[lang?.toLowerCase()] || 'txt'}`
}

const s = {
  panel: {
    width: 480, borderLeft: '1px solid var(--bd)', display: 'flex',
    flexDirection: 'column', background: 'var(--bg)', flexShrink: 0,
    transition: 'width 0.2s ease', overflow: 'hidden',
  },
  panelExpanded: { width: 720 },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', borderBottom: '1px solid var(--bd)',
    background: 'var(--bg1)', flexShrink: 0, gap: 8, minHeight: 40,
  },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', flex: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  panelLabel:  { fontSize: 10, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Berkeley Mono', monospace", flexShrink: 0 },
  artifactTitle: { fontSize: 12, color: 'var(--tx2)', fontFamily: "'Berkeley Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  tabRow:    { display: 'flex', gap: 2, overflow: 'hidden' },
  tab:       { background: 'none', border: '1px solid transparent', borderRadius: 5, padding: '3px 9px', fontSize: 11, color: 'var(--tx4)', cursor: 'pointer', fontFamily: "'Berkeley Mono', monospace", display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  tabActive: { background: 'var(--bg3)', borderColor: 'var(--bd3)', color: 'var(--ac2)' },

  streamDot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--ac)', display: 'inline-block', animation: 'blink 1s infinite' },

  viewToggle:    { display: 'flex', background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden' },
  viewBtn:       { background: 'none', border: 'none', color: 'var(--tx4)', padding: '3px 9px', fontSize: 11, cursor: 'pointer', fontFamily: "'Berkeley Mono', monospace", display: 'flex', alignItems: 'center', gap: 4 },
  viewBtnActive: { background: 'var(--bg4)', color: 'var(--ac2)' },

  actionBtn: { background: 'none', border: '1px solid var(--bd)', borderRadius: 5, padding: '4px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' },

  statusBar: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px',
    background: 'var(--bg)', borderBottom: '1px solid var(--bd)', flexShrink: 0,
  },
  langTag:      { fontSize: 10, color: 'var(--ac)', fontFamily: "'Berkeley Mono', monospace", background: 'var(--bg5)', padding: '1px 7px', borderRadius: 10 },
  lineCount:    { fontSize: 10, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace" },
  savedTag:     { fontSize: 10, color: '#4ade80', fontFamily: "'Berkeley Mono', monospace" },
  applyMsg:     { fontSize: 10, fontFamily: "'Berkeley Mono', monospace" },
  streamingTag: { fontSize: 10, color: 'var(--ac)', fontFamily: "'Berkeley Mono', monospace", marginLeft: 'auto', animation: 'blink 1.5s infinite' },

  diffInputRow:  { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--bd)', flexShrink: 0 },
  diffInputLabel:{ fontSize: 11, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace", paddingTop: 8, flexShrink: 0 },
  diffInput:     { flex: 1, background: 'var(--bg2)', color: 'var(--tx2)', border: '1px solid var(--bd)', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: "'Berkeley Mono', monospace", resize: 'vertical', outline: 'none' },

  codeArea:    { flex: 1, overflow: 'auto' },
  highlighter: { margin: 0, borderRadius: 0, fontSize: 12, background: 'transparent', minHeight: '100%' },

  diffView:   { fontFamily: "'Berkeley Mono', monospace", fontSize: 12, lineHeight: 1.5 },
  diffLine:   { display: 'flex', alignItems: 'flex-start', gap: 0 },
  diffAdd:    { background: '#0a1f0a' },
  diffRemove: { background: '#1f0a0a' },
  diffSame:   {},
  diffMark:   { width: 18, textAlign: 'center', flexShrink: 0, color: 'var(--tx4)', userSelect: 'none', paddingTop: 1 },
  diffLineNum:{ width: 36, textAlign: 'right', color: 'var(--bd2)', paddingRight: 10, flexShrink: 0, userSelect: 'none', paddingTop: 1 },
  diffCode:   { flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--tx2)', padding: '1px 8px' },

  navBar:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '6px', borderTop: '1px solid var(--bd)', flexShrink: 0 },
  navBtn:  { background: 'none', border: '1px solid var(--bd)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', color: 'var(--tx3)', display: 'flex' },
  navCount:{ fontSize: 11, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace" },
}
