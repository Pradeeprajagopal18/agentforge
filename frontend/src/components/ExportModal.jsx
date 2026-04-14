import { API } from '../config.js'
import React, { useState } from 'react'
import { X, Download, FileText, FileJson, Check, Loader } from 'lucide-react'



function ExportOption({ icon: Icon, label, description, color, onClick, loading, done }) {
  return (
    <button style={{ ...s.option, ...(done ? s.optionDone : {}) }} onClick={onClick} disabled={loading || done}>
      <div style={{ ...s.optionIcon, background: color + '18', border: `1px solid ${color}30` }}>
        {done
          ? <Check size={18} color="#4ade80" />
          : loading
            ? <Loader size={18} color={color} style={{ animation: 'spin 1s linear infinite' }} />
            : <Icon size={18} color={color} />
        }
      </div>
      <div style={s.optionText}>
        <span style={s.optionLabel}>{label}</span>
        <span style={s.optionDesc}>{description}</span>
      </div>
      {!loading && !done && (
        <div style={s.optionArrow}>
          <Download size={13} color="#444" />
        </div>
      )}
    </button>
  )
}

export default function ExportModal({ convId, convTitle, messageCount, onClose }) {
  const [loadingMd,   setLoadingMd]   = useState(false)
  const [loadingJson, setLoadingJson] = useState(false)
  const [doneMd,      setDoneMd]      = useState(false)
  const [doneJson,    setDoneJson]    = useState(false)
  const [error,       setError]       = useState(null)

  const download = async (format) => {
    const setLoading = format === 'markdown' ? setLoadingMd : setLoadingJson
    const setDone    = format === 'markdown' ? setDoneMd    : setDoneJson
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API}/conversations/${convId}/export/${format}`)
      if (!r.ok) throw new Error(`Export failed: ${r.status}`)
      const blob = await r.blob()
      const ext  = format === 'markdown' ? 'md' : 'json'
      const safe = (convTitle || 'conversation').slice(0, 40).replace(/[^a-z0-9_\-]/gi, '_')
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${safe}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <Download size={15} color="#7c6af7" />
            <span style={s.title}>Export Conversation</span>
          </div>
          <button style={s.closeBtn} onClick={onClose}><X size={15} /></button>
        </div>

        {/* Conversation info */}
        <div style={s.convInfo}>
          <span style={s.convTitle}>{convTitle || 'Untitled conversation'}</span>
          <span style={s.convMeta}>{messageCount} messages</span>
        </div>

        {/* Export options */}
        <div style={s.options}>
          <ExportOption
            icon={FileText}
            label="Markdown (.md)"
            description="Formatted text with code blocks, readable in any editor"
            color="#60a5fa"
            onClick={() => download('markdown')}
            loading={loadingMd}
            done={doneMd}
          />
          <ExportOption
            icon={FileJson}
            label="JSON (.json)"
            description="Full data export with tool calls, costs, and timestamps"
            color="#a78bfa"
            onClick={() => download('json')}
            loading={loadingJson}
            done={doneJson}
          />
        </div>

        {/* Copy to clipboard option */}
        <CopyToClipboard convId={convId} />

        {error && <div style={s.error}>⚠ {error}</div>}

        <div style={s.footer}>
          Exports include all messages, tool calls, and attachment references
        </div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

function CopyToClipboard({ convId }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      const r = await fetch(`${API}/conversations/${convId}/export/markdown`)
      const text = await r.text()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
  }
  return (
    <button style={s.copyBtn} onClick={copy}>
      {copied
        ? <><Check size={13} color="#4ade80" /> <span style={{ color: '#4ade80' }}>Copied to clipboard!</span></>
        : <><FileText size={13} color="#666" /> <span>Copy as Markdown</span></>
      }
    </button>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(4px)'
  },
  modal: {
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 14,
    width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1)'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--tx)', fontFamily: "'DM Sans', sans-serif" },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', padding: 3 },

  convInfo: {
    padding: '12px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--bd)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  },
  convTitle: { fontSize: 13, color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' },
  convMeta:  { fontSize: 11, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace" },

  options: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 },
  option: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10,
    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', width: '100%'
  },
  optionDone: { borderColor: '#1a3a1a', background: '#0a140a' },
  optionIcon: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionText: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  optionLabel: { fontSize: 13, fontWeight: 500, color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif" },
  optionDesc:  { fontSize: 11, color: 'var(--tx4)', fontFamily: "'DM Sans', sans-serif" },
  optionArrow: { flexShrink: 0 },

  copyBtn: {
    margin: '0 18px 14px', display: 'flex', alignItems: 'center', gap: 7,
    background: 'none', border: '1px dashed var(--bd2)', borderRadius: 8,
    padding: '8px 14px', cursor: 'pointer', color: 'var(--tx4)',
    fontSize: 12, fontFamily: "'DM Sans', sans-serif", width: 'calc(100% - 36px)',
    transition: 'all 0.15s'
  },
  error: { margin: '0 18px 12px', fontSize: 12, color: '#f87171', padding: '8px 12px', background: '#1a0a0a', borderRadius: 7 },
  footer: { padding: '10px 18px', fontSize: 11, color: 'var(--tx5)', borderTop: '1px solid var(--bd)', fontFamily: "'Berkeley Mono', monospace" },
}
