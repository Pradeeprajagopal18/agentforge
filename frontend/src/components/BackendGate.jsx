import { API } from '../config.js'
import React, { useEffect, useState } from 'react'


const MAX_RETRIES = 30
const RETRY_INTERVAL_MS = 800

export default function BackendGate({ children }) {
  const [status, setStatus]   = useState('connecting')
  const [attempt, setAttempt] = useState(0)
  const [dots,    setDots]    = useState('.')

  useEffect(() => {
    const t = setInterval(() => {
      setDots(d => d.length >= 3 ? '.' : d + '.')
    }, 400)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (status === 'ready') return
    let cancelled = false
    let retries = 0

    const poll = async () => {
      while (retries < MAX_RETRIES && !cancelled) {
        try {
          const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(1500) })
          if (r.ok) {
            if (!cancelled) setStatus('ready')
            return
          }
        } catch {}
        retries++
        if (!cancelled) setAttempt(retries)
        await new Promise(res => setTimeout(res, RETRY_INTERVAL_MS))
      }
      if (!cancelled) setStatus('failed')
    }

    poll()
    return () => { cancelled = true }
  }, [])

  if (status === 'ready') return children

  return (
    <div style={s.screen}>
      <div style={s.card}>
        <div style={s.logo}>⬡</div>
        <h2 style={s.title}>AgentForge</h2>

        {status === 'connecting' && (
          <>
            <div style={s.spinnerRow}>
              <div style={s.spinner} />
              <span style={s.statusText}>Starting backend{dots}</span>
            </div>
            <div style={s.progressTrack}>
              <div style={{
                ...s.progressBar,
                width: `${Math.min(95, (attempt / MAX_RETRIES) * 100)}%`
              }} />
            </div>
            <p style={s.hint}>Launching Python server…</p>
          </>
        )}

        {status === 'failed' && (
          <>
            <div style={s.errorIcon}>✗</div>
            <p style={s.errorText}>Backend failed to start</p>
            <p style={s.hint}>
              Make sure Python 3.11+ is installed and<br />
              <code style={s.code}>pip install -r backend/requirements.txt</code><br />
              has been run.<br /><br />
              <strong style={{color:'var(--tx)'}}>Auth (pick one):</strong><br />
              Set <code style={s.code}>ANTHROPIC_API_KEY</code> in <code style={s.code}>backend/.env</code><br />
              — or — run <code style={s.code}>claude /login</code> in your terminal
            </p>
            <button style={s.retryBtn} onClick={() => { setStatus('connecting'); setAttempt(0) }}>
              Retry
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
      `}</style>
    </div>
  )
}

const s = {
  screen: {
    height: '100vh', background: 'var(--bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'DM Sans', sans-serif",
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 14, padding: '40px 48px', background: 'var(--bg2)',
    border: '1px solid var(--bd2)', borderRadius: 16,
    boxShadow: '0 24px 60px rgba(0,0,0,0.4)', minWidth: 320,
  },
  logo:  { fontSize: 48, color: 'var(--ac)', lineHeight: 1 },
  title: { fontSize: 20, fontWeight: 300, color: 'var(--tx)', letterSpacing: -0.3 },

  spinnerRow: { display: 'flex', alignItems: 'center', gap: 10 },
  spinner: {
    width: 16, height: 16, borderRadius: '50%',
    border: '2px solid var(--bd2)', borderTopColor: 'var(--ac)',
    animation: 'rotate 0.8s linear infinite',
  },
  statusText: { fontSize: 13, color: 'var(--tx3)', fontFamily: "'Berkeley Mono', monospace" },

  progressTrack: {
    width: '100%', height: 3, background: 'var(--bg5)',
    borderRadius: 2, overflow: 'hidden',
  },
  progressBar: {
    height: '100%', background: 'var(--ac)', borderRadius: 2,
    transition: 'width 0.6s ease',
  },
  hint: { fontSize: 12, color: 'var(--tx4)', textAlign: 'center', lineHeight: 1.6 },

  errorIcon: { fontSize: 28, color: '#f87171' },
  errorText: { fontSize: 14, color: '#f87171' },
  code: {
    fontFamily: "'Berkeley Mono', monospace", fontSize: 11,
    background: 'var(--bg5)', padding: '2px 6px', borderRadius: 4, color: 'var(--ac)',
  },
  retryBtn: {
    background: 'var(--ac)', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 24px', cursor: 'pointer',
    fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  },
}
