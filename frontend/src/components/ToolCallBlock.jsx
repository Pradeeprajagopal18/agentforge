import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal, FileText, Search, Edit3, FolderOpen } from 'lucide-react'

const TOOL_ICONS = {
  Bash: Terminal,
  Read: FileText,
  Write: Edit3,
  Edit: Edit3,
  Glob: FolderOpen,
  Grep: Search,
}

const TOOL_COLORS = {
  Bash:  '#f59e0b',
  Read:  '#60a5fa',
  Write: '#34d399',
  Edit:  '#34d399',
  Glob:  '#a78bfa',
  Grep:  '#f472b6',
}

export default function ToolCallBlock({ toolCalls }) {
  const [expanded, setExpanded] = useState({})

  if (!toolCalls?.length) return null

  const toggle = (i) => setExpanded(e => ({ ...e, [i]: !e[i] }))

  return (
    <div style={styles.container}>
      {toolCalls.map((tc, i) => {
        const Icon = TOOL_ICONS[tc.name] || Terminal
        const color = TOOL_COLORS[tc.name] || 'var(--tx3)'
        const isOpen = expanded[i]
        return (
          <div key={i} style={styles.block}>
            <button style={styles.header} onClick={() => toggle(i)}>
              <div style={styles.left}>
                <span style={{ ...styles.dot, background: color }} />
                <Icon size={12} color={color} />
                <span style={{ ...styles.toolName, color }}>{tc.name}</span>
                {tc.input?.command && (
                  <span style={styles.preview}>
                    {String(tc.input.command).slice(0, 50)}
                    {String(tc.input.command).length > 50 ? '…' : ''}
                  </span>
                )}
                {tc.input?.path && (
                  <span style={styles.preview}>{tc.input.path}</span>
                )}
              </div>
              {isOpen
                ? <ChevronDown size={12} color="var(--tx4)" />
                : <ChevronRight size={12} color="var(--tx4)" />
              }
            </button>
            {isOpen && (
              <pre style={styles.detail}>
                {JSON.stringify(tc.input, null, 2)}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  container: { margin: '6px 0', display: 'flex', flexDirection: 'column', gap: 4 },
  block: { background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 6, overflow: 'hidden' },
  header: {
    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 10px', gap: 8
  },
  left: { display: 'flex', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  toolName: { fontSize: 11, fontFamily: "'Berkeley Mono', monospace", fontWeight: 600, letterSpacing: 0.5 },
  preview: { fontSize: 11, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace", overflow: 'hidden', maxWidth: 260, whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  detail: {
    margin: 0, padding: '8px 12px', fontSize: 11,
    fontFamily: "'Berkeley Mono', monospace",
    color: 'var(--tx3)', background: 'var(--bg)',
    borderTop: '1px solid var(--bd)', overflowX: 'auto',
    maxHeight: 200, overflowY: 'auto'
  },
}
