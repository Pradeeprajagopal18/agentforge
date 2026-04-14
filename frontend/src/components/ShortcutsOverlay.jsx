import React from 'react'
import { X, Keyboard } from 'lucide-react'

const SHORTCUTS = [
  { section: 'Navigation' },
  { keys: ['⌘', 'K'],          desc: 'New conversation' },
  { keys: ['⌘', ','],          desc: 'Settings' },
  { keys: ['⌘', '/'],          desc: 'Keyboard shortcuts' },
  { keys: ['⌘', 'E'],          desc: 'Export conversation' },
  { keys: ['⌘', 'Shift', 'C'], desc: 'Copy last response' },
  { keys: ['⌘', 'F'],          desc: 'Search conversations' },

  { section: 'Power Features' },
  { keys: ['⌘', 'P'],          desc: 'Prompt Library' },
  { keys: ['⌘', 'R'],          desc: 'PR Reviewer (5 personas, parallel)' },
  { keys: ['⌘', 'B'],          desc: 'Toggle Artifacts Panel' },

  { section: 'Input' },
  { keys: ['Enter'],            desc: 'Send message' },
  { keys: ['Shift', 'Enter'],   desc: 'New line' },
  { keys: ['@'],                desc: 'Mention a file (autocomplete)' },
  { keys: ['/'],                desc: 'Insert a prompt (autocomplete)' },
  { keys: ['Esc'],              desc: 'Stop generation / close panels' },

  { section: 'Conversations' },
  { keys: ['F2'],               desc: 'Rename conversation' },
  { keys: ['★ icon'],           desc: 'Pin / unpin conversation' },
  { keys: ['branch button'],    desc: 'Fork conversation from message' },
]

export default function ShortcutsOverlay({ onClose }) {
  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        <div style={s.header}>
          <div style={s.headerLeft}>
            <Keyboard size={14} color="var(--ac)" />
            <span style={s.title}>Keyboard Shortcuts</span>
          </div>
          <button style={s.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div style={s.body}>
          {SHORTCUTS.map((item, i) => {
            if (item.section) return (
              <div key={i} style={s.sectionLabel}>{item.section}</div>
            )
            return (
              <div key={i} style={s.row}>
                <div style={s.keys}>
                  {item.keys.map((k, j) => (
                    <React.Fragment key={j}>
                      <kbd style={s.kbd}>{k}</kbd>
                      {j < item.keys.length - 1 && <span style={s.plus}>+</span>}
                    </React.Fragment>
                  ))}
                </div>
                <span style={s.desc}>{item.desc}</span>
              </div>
            )
          })}
        </div>

        <div style={s.footer}>
          Press <kbd style={s.kbd}>⌘/</kbd> or <kbd style={s.kbd}>Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 300, backdropFilter: 'blur(4px)',
  },
  panel: {
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 14,
    width: 420, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '13px 18px', borderBottom: '1px solid var(--bd)', background: 'var(--bg1)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  title:    { fontSize: 14, fontWeight: 600, color: 'var(--tx)', fontFamily: "'DM Sans', sans-serif" },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', padding: 3 },

  body: { flex: 1, overflowY: 'auto', padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 1 },
  sectionLabel: {
    fontSize: 10, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: 1,
    fontFamily: "'Berkeley Mono', monospace", marginTop: 14, marginBottom: 4,
    paddingBottom: 4, borderBottom: '1px solid var(--bd)',
  },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0',
  },
  keys: { display: 'flex', alignItems: 'center', gap: 3 },
  kbd: {
    background: 'var(--bg5)', border: '1px solid var(--bd2)', borderRadius: 5,
    padding: '2px 6px', fontSize: 11, fontFamily: "'Berkeley Mono', monospace",
    color: 'var(--ac2)', minWidth: 22, textAlign: 'center', display: 'inline-block',
  },
  plus: { fontSize: 10, color: 'var(--tx4)' },
  desc: { fontSize: 12, color: 'var(--tx3)', fontFamily: "'DM Sans', sans-serif" },
  footer: {
    padding: '10px 18px', borderTop: '1px solid var(--bd)',
    fontSize: 11, color: 'var(--tx5)', fontFamily: "'Berkeley Mono', monospace",
  },
}
