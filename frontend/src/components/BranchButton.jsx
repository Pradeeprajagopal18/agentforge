import { API } from '../config.js'
import React, { useState } from 'react'
import { GitBranch, Loader, Check } from 'lucide-react'



/**
 * BranchButton — shown on hover of each user message bubble.
 * Creates a forked conversation with history up to that message.
 *
 * Props:
 *   convId      — current conversation id
 *   msgId       — message id to branch at
 *   onBranched  — callback(newConv) when branch created
 */
export default function BranchButton({ convId, msgId, onBranched }) {
  const [state, setState] = useState('idle')  // idle | loading | done

  const branch = async (e) => {
    e.stopPropagation()
    if (state !== 'idle') return
    setState('loading')
    try {
      const r = await fetch(`${API}/conversations/${convId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_at_msg_id: msgId }),
      })
      const newConv = await r.json()
      setState('done')
      onBranched?.(newConv)
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      style={{ ...s.btn, ...(state === 'done' ? s.btnDone : {}) }}
      onClick={branch}
      title="Fork conversation from this message"
      disabled={state !== 'idle'}
    >
      {state === 'loading' && <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />}
      {state === 'done'    && <Check  size={11} color="#4ade80" />}
      {state === 'idle'    && <GitBranch size={11} />}
      {state === 'idle' && <span style={s.label}>Fork</span>}
      {state === 'done' && <span style={{ ...s.label, color: '#4ade80' }}>Forked!</span>}
    </button>
  )
}

const s = {
  btn: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'var(--bg2)', border: '1px solid var(--bd2)',
    borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
    color: 'var(--tx4)', fontSize: 11, fontFamily: "'Berkeley Mono', monospace",
    transition: 'all 0.15s', opacity: 0,
  },
  btnDone: { borderColor: '#1a3a1a', background: '#0a140a' },
  label: { fontSize: 10 },
}
