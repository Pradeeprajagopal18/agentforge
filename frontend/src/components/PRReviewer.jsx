import { API, WS_BASE } from '../config.js'
import React, { useState, useRef, useEffect } from 'react'
import { GitPullRequest, Shield, Cpu, TestTube2, Zap, BookOpen, X, ChevronDown, ChevronUp, Copy, Check, AlertTriangle, Info, AlertCircle, Loader, Link, RefreshCw } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer.jsx'




const PERSONAS = [
  {
    id: 'architect',
    label: 'Application Architect',
    icon: Cpu,
    color: '#60a5fa',
    focus: 'Design patterns, coupling, scalability, API contracts, architectural decisions',
  },
  {
    id: 'security',
    label: 'Security Engineer',
    icon: Shield,
    color: '#f87171',
    focus: 'OWASP Top 10, injection risks, auth/authz, secrets, dependency vulnerabilities',
  },
  {
    id: 'qa',
    label: 'QA Engineer',
    icon: TestTube2,
    color: '#4ade80',
    focus: 'Test coverage gaps, edge cases, error handling, regression risk',
  },
  {
    id: 'performance',
    label: 'Performance Engineer',
    icon: Zap,
    color: '#facc15',
    focus: 'Algorithmic complexity, N+1 queries, memory allocation, caching opportunities',
  },
  {
    id: 'quality',
    label: 'Code Quality',
    icon: BookOpen,
    color: '#c084fc',
    focus: 'Naming, dead code, over-engineering, documentation gaps, conventions',
  },
]

const SEVERITY_STYLES = {
  critical: { color: '#f87171', bg: '#1a0808', icon: AlertCircle  },
  major:    { color: '#fb923c', bg: '#1a0f08', icon: AlertTriangle },
  minor:    { color: '#facc15', bg: '#1a1808', icon: Info          },
  nit:      { color: '#888',    bg: '#111',    icon: Info          },
}

function PersonaCard({ persona, result, streaming }) {
  const [open, setOpen] = useState(true)
  const Icon = persona.icon

  const verdict = result?.text
    ? result.text.match(/\b(APPROVE|REQUEST CHANGES|NEEDS DISCUSSION)\b/i)?.[0]
    : null

  const verdictColor = {
    'APPROVE': '#4ade80',
    'REQUEST CHANGES': '#f87171',
    'NEEDS DISCUSSION': '#facc15',
  }[verdict?.toUpperCase()]

  return (
    <div style={{ ...pc.card, borderColor: open ? persona.color + '44' : '#1e1e2e' }}>
      <button style={pc.header} onClick={() => setOpen(o => !o)}>
        <div style={pc.headerLeft}>
          <div style={{ ...pc.iconBox, background: persona.color + '18', border: `1px solid ${persona.color}30` }}>
            <Icon size={14} color={persona.color} />
          </div>
          <div style={pc.headerInfo}>
            <span style={{ ...pc.personaName, color: persona.color }}>{persona.label}</span>
            {!result && !streaming && (
              <span style={pc.focus}>{persona.focus}</span>
            )}
            {streaming && (
              <span style={pc.streamingLabel}>
                <span style={pc.streamDot} /> analyzing…
              </span>
            )}
            {verdict && !streaming && (
              <span style={{ ...pc.verdict, color: verdictColor }}>
                {verdict}
              </span>
            )}
          </div>
        </div>
        <div style={pc.headerRight}>
          {result?.text && !streaming && (
            <CopyBtn text={result.text} />
          )}
          {open ? <ChevronUp size={13} color="#444" /> : <ChevronDown size={13} color="#444" />}
        </div>
      </button>

      {open && result?.text && (
        <div style={pc.body}>
          <MarkdownRenderer content={result.text} />
        </div>
      )}
      {open && streaming && !result?.text && (
        <div style={pc.loadingBody}>
          <Loader size={14} color={persona.color} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: '#555', fontSize: 12, fontFamily: "'Berkeley Mono', monospace" }}>
            reviewing…
          </span>
        </div>
      )}
    </div>
  )
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  const copy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setDone(true); setTimeout(() => setDone(false), 2000)
  }
  return (
    <button style={pc.copyBtn} onClick={copy} title="Copy">
      {done ? <Check size={11} color="#4ade80" /> : <Copy size={11} color="#666" />}
    </button>
  )
}

export default function PRReviewer({ onClose }) {
  const [diff,        setDiff]        = useState('')
  const [context,     setContext]     = useState('')
  const [results,     setResults]     = useState({})
  const [streaming,   setStreaming]   = useState({})
  const [running,     setRunning]     = useState(false)
  const [done,        setDone]        = useState(false)
  const [ghUrl,       setGhUrl]       = useState('')
  const [fetching,    setFetching]    = useState(false)
  const [fetchError,  setFetchError]  = useState(null)
  const [fetchedMeta, setFetchedMeta] = useState(null)
  const wsRefs = useRef({})

  useEffect(() => {
    return () => Object.values(wsRefs.current).forEach(ws => ws?.close())
  }, [])

  const fetchFromGitHub = async () => {
    if (!ghUrl.trim()) return
    setFetching(true); setFetchError(null); setFetchedMeta(null)
    try {
      const r = await fetch(`${API}/github/pr-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ghUrl.trim() }),
      })
      const d = await r.json()
      if (!r.ok) {
        setFetchError(d.detail || 'Failed to fetch PR diff')
        return
      }
      setDiff(d.diff)
      setFetchedMeta(d)
      // Pre-fill context with PR title + description
      const ctxParts = []
      if (d.title)       ctxParts.push(`PR: ${d.title}`)
      if (d.repo)        ctxParts.push(`Repo: ${d.repo}`)
      if (d.base_branch) ctxParts.push(`Base: ${d.base_branch} ← ${d.head_branch}`)
      if (d.body?.trim()) ctxParts.push(`\nDescription:\n${d.body.slice(0, 500)}`)
      if (ctxParts.length) setContext(ctxParts.join('\n'))
    } catch (e) {
      setFetchError(e.message)
    } finally {
      setFetching(false)
    }
  }

  const runReview = () => {
    if (!diff.trim()) return
    setRunning(true); setDone(false)
    setResults({})
    setStreaming(Object.fromEntries(PERSONAS.map(p => [p.id, true])))
    Object.values(wsRefs.current).forEach(ws => ws?.close())
    wsRefs.current = {}
    let completed = 0
    PERSONAS.forEach(persona => {
      const ws = new WebSocket(`${WS_BASE}/ws/${crypto.randomUUID()}`)
      wsRefs.current[persona.id] = ws
      let accumulated = ''
      ws.onopen = () => ws.send(JSON.stringify({ message: buildPersonaPrompt(persona, diff, context), attachments: [] }))
      ws.onmessage = ({ data }) => {
        const event = JSON.parse(data)
        if (event.type === 'assistant') {
          const text = (event.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
          if (text) { accumulated += text; setResults(r => ({ ...r, [persona.id]: { text: accumulated } })) }
        }
        if (event.type === 'result' || event.type === 'error') {
          setStreaming(s => ({ ...s, [persona.id]: false }))
          if (!accumulated) setResults(r => ({ ...r, [persona.id]: { text: 'No response.' } }))
          if (++completed === PERSONAS.length) { setRunning(false); setDone(true) }
          ws.close()
        }
      }
      ws.onerror = () => {
        setStreaming(s => ({ ...s, [persona.id]: false }))
        setResults(r => ({ ...r, [persona.id]: { text: 'Connection error.' } }))
        if (++completed === PERSONAS.length) { setRunning(false); setDone(true) }
      }
    })
  }

  const overallVerdict = () => {
    const texts = Object.values(results).map(r => r?.text || '')
    if (texts.some(t => t.match(/request changes/i))) return { label: 'REQUEST CHANGES', color: '#f87171' }
    if (texts.some(t => t.match(/needs discussion/i))) return { label: 'NEEDS DISCUSSION', color: '#facc15' }
    if (texts.every(t => t.match(/approve/i)))         return { label: 'APPROVE', color: '#4ade80' }
    return null
  }

  const verdict = done ? overallVerdict() : null

  return (
    <div style={pr.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={pr.panel}>

        {/* ── Header ── */}
        <div style={pr.header}>
          <div style={pr.headerLeft}>
            <GitPullRequest size={16} color="#7c6af7" />
            <span style={pr.title}>PR Reviewer</span>
            <span style={pr.subtitle}>5 expert personas · powered by Claude Code</span>
          </div>
          <div style={pr.headerRight}>
            {verdict && (
              <span style={{ ...pr.verdictBadge, color: verdict.color, borderColor: verdict.color + '44' }}>
                {verdict.label}
              </span>
            )}
            <button style={pr.closeBtn} onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        <div style={pr.body}>
          {/* ── Input column ── */}
          <div style={pr.inputCol}>

            {/* GitHub URL fetch */}
            <div style={pr.inputSection}>
              <label style={pr.label}>GitHub PR URL</label>
              <div style={pr.urlRow}>
                <input
                  style={pr.urlInput}
                  value={ghUrl}
                  onChange={e => { setGhUrl(e.target.value); setFetchError(null) }}
                  onKeyDown={e => e.key === 'Enter' && fetchFromGitHub()}
                  placeholder="https://github.com/owner/repo/pull/123"
                  disabled={running || fetching}
                />
                <button
                  style={{ ...pr.fetchBtn, opacity: (ghUrl.trim() && !fetching && !running) ? 1 : 0.4 }}
                  onClick={fetchFromGitHub}
                  disabled={!ghUrl.trim() || fetching || running}
                  title="Fetch PR diff from GitHub"
                >
                  {fetching
                    ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <RefreshCw size={13} />
                  }
                  {fetching ? 'Fetching…' : 'Fetch'}
                </button>
              </div>
              {fetchError && (
                <div style={pr.fetchError}>
                  <AlertCircle size={11} /> {fetchError}
                  {fetchError.includes('token') && (
                    <span style={pr.fetchHint}> — add a GitHub token in Settings → Integrations</span>
                  )}
                </div>
              )}
              {fetchedMeta && (
                <div style={pr.fetchSuccess}>
                  <Check size={11} color="#4ade80" />
                  <span>
                    <strong style={{ color: 'var(--tx2)' }}>{fetchedMeta.repo}#{fetchedMeta.pr_number}</strong>
                    {' · '}{fetchedMeta.title}
                  </span>
                </div>
              )}
              <div style={pr.orDivider}><span style={pr.orText}>or paste diff below</span></div>
            </div>

            <div style={pr.inputSection}>
              <label style={pr.label}>PR Diff / Code Changes *</label>
              <textarea
                style={pr.textarea}
                value={diff}
                onChange={e => setDiff(e.target.value)}
                placeholder={`Paste your git diff or code changes here…\n\n$ git diff main..feature-branch`}
                rows={12}
                disabled={running}
              />
            </div>
            <div style={pr.inputSection}>
              <label style={pr.label}>Context (optional)</label>
              <textarea
                style={{ ...pr.textarea, minHeight: 80 }}
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="PR title, description, ticket number, tech stack, special concerns…"
                rows={4}
                disabled={running}
              />
            </div>
            <div style={pr.personasPreview}>
              <div style={pr.label}>Will review with:</div>
              <div style={pr.personaChips}>
                {PERSONAS.map(p => {
                  const Icon = p.icon
                  const isDone    = !!results[p.id]
                  const isStreaming = streaming[p.id]
                  return (
                    <div key={p.id} style={{ ...pr.chip, borderColor: (isDone || isStreaming) ? p.color + '66' : '#1e1e2e' }}>
                      {isStreaming
                        ? <Loader size={11} color={p.color} style={{ animation: 'spin 1s linear infinite' }} />
                        : isDone
                          ? <Check size={11} color={p.color} />
                          : <Icon size={11} color={isDone ? p.color : '#444'} />
                      }
                      <span style={{ ...pr.chipLabel, color: (isDone || isStreaming) ? p.color : '#555' }}>
                        {p.label.split(' ')[0]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <button
              style={{ ...pr.runBtn, opacity: (diff.trim() && !running) ? 1 : 0.4 }}
              onClick={runReview}
              disabled={!diff.trim() || running}
            >
              {running
                ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Reviewing…</>
                : <><GitPullRequest size={14} /> Run Full Review</>
              }
            </button>
          </div>

          {/* ── Results column ── */}
          <div style={pr.resultsCol}>
            {PERSONAS.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                result={results[persona.id]}
                streaming={streaming[persona.id]}
              />
            ))}
            {!running && !done && Object.keys(results).length === 0 && (
              <div style={pr.emptyState}>
                <GitPullRequest size={32} color="#222" />
                <p style={pr.emptyTitle}>Paste your diff and run the review</p>
                <p style={pr.emptyDesc}>
                  Each of the 5 expert personas will independently analyze the code
                  and produce a structured review with severity ratings.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

function buildPersonaPrompt(persona, diff, context) {
  const ctx = context.trim() ? `\n\nContext: ${context}` : ''
  return `You are a ${persona.label} conducting a focused code review.
Your expertise: ${persona.focus}

Review ONLY from your perspective. Be specific, actionable, and concise.
For each finding use format: **[SEVERITY]** location — issue — recommendation
Severity levels: critical / major / minor / nit

End with a one-line verdict: APPROVE, REQUEST CHANGES, or NEEDS DISCUSSION.${ctx}

\`\`\`diff
${diff}
\`\`\``
}

// ── Persona card styles ────────────────────────────────────────────
const pc = {
  card: {
    border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden',
    background: 'var(--bg1)', transition: 'border-color 0.2s',
  },
  header: {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 8,
  },
  headerLeft:  { display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBox:     { width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  headerInfo:  { display: 'flex', flexDirection: 'column', gap: 2 },
  personaName: { fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" },
  focus:       { fontSize: 11, color: 'var(--tx5)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 },
  streamingLabel: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--tx3)', fontFamily: "'Berkeley Mono', monospace" },
  streamDot:   { width: 6, height: 6, borderRadius: '50%', background: 'var(--ac)', display: 'inline-block', animation: 'blink 1s infinite' },
  verdict:     { fontSize: 11, fontWeight: 700, fontFamily: "'Berkeley Mono', monospace", letterSpacing: 0.5 },
  body:        { padding: '0 14px 14px', fontSize: 13 },
  loadingBody: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' },
  copyBtn:     { background: 'none', border: 'none', cursor: 'pointer', padding: 3, display: 'flex' },
}

// ── Panel styles ───────────────────────────────────────────────────
const pr = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(6px)', padding: '24px',
  },
  panel: {
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 14,
    width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7)', overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 20px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1)',
    flexShrink: 0,
  },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 10 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  title:    { fontSize: 15, fontWeight: 600, color: 'var(--tx)', fontFamily: "'DM Sans', sans-serif" },
  subtitle: { fontSize: 11, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace" },
  verdictBadge: { fontSize: 11, fontWeight: 700, border: '1px solid', borderRadius: 20, padding: '3px 10px', fontFamily: "'Berkeley Mono', monospace" },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', padding: 4 },

  body: { flex: 1, display: 'flex', overflow: 'hidden' },

  inputCol:    { width: 360, flexShrink: 0, borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  inputSection:{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  label:       { fontSize: 10, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: "'Berkeley Mono', monospace" },
  textarea:    {
    background: 'var(--bg)', color: 'var(--tx2)', border: '1px solid var(--bd)',
    borderRadius: 8, padding: '10px 12px', fontSize: 12, fontFamily: "'Berkeley Mono', monospace",
    resize: 'vertical', outline: 'none', lineHeight: 1.5, width: '100%', boxSizing: 'border-box',
    flex: 1,
  },
  personasPreview: { padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  personaChips:    { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip:        { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--bg1)', border: '1px solid', borderRadius: 20 },
  chipLabel:   { fontSize: 11, fontFamily: "'DM Sans', sans-serif", fontWeight: 500 },

  runBtn: {
    margin: '0 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'var(--ac)', border: 'none', color: '#fff', borderRadius: 10,
    padding: '10px', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
    transition: 'opacity 0.15s',
  },

  resultsCol: { flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontSize: 15, color: 'var(--tx4)', fontFamily: "'DM Sans', sans-serif" },
  emptyDesc:  { fontSize: 13, color: 'var(--tx5)', textAlign: 'center', lineHeight: 1.6, maxWidth: 360, fontFamily: "'DM Sans', sans-serif" },

  urlRow:   { display: 'flex', gap: 6 },
  urlInput: {
    flex: 1, background: 'var(--bg)', color: 'var(--tx2)', border: '1px solid var(--bd)',
    borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: "'Berkeley Mono', monospace",
    outline: 'none', minWidth: 0,
  },
  fetchBtn: {
    display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg4)',
    border: '1px solid var(--bd2)', borderRadius: 7, padding: '7px 12px',
    cursor: 'pointer', fontSize: 12, color: 'var(--ac2)', fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500, flexShrink: 0, transition: 'opacity 0.15s',
  },
  fetchError: {
    display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 5, fontSize: 11,
    color: '#f87171', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
  },
  fetchHint: { color: 'var(--tx4)' },
  fetchSuccess: {
    display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11,
    color: 'var(--tx3)', fontFamily: "'DM Sans', sans-serif",
    background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 6,
    padding: '4px 8px',
  },
  orDivider: {
    display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
  },
  orText: {
    fontSize: 10, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace",
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
}
