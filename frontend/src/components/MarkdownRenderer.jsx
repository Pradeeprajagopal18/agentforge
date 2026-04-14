import React, { useState } from 'react'
import { useTheme } from '../ThemeContext.jsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={styles.copyBtn} title="Copy code">
      {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} color="var(--tx3)" />}
    </button>
  )
}

export default function MarkdownRenderer({ content }) {
  const { mode } = useTheme()
  const hlTheme  = mode === 'light' ? oneLight : oneDark

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }) {
          const match    = /language-(\w+)/.exec(className || '')
          const codeText = String(children).replace(/\n$/, '')
          // Block code: has a language class and is multi-line
          const isBlock  = match && codeText.includes('\n')
          if (isBlock) {
            return (
              <div style={styles.codeBlock}>
                <div style={styles.codeHeader}>
                  <span style={styles.codeLang}>{match[1]}</span>
                  <CopyButton text={codeText} />
                </div>
                <SyntaxHighlighter
                  style={hlTheme}
                  language={match[1]}
                  PreTag="div"
                  customStyle={styles.highlighter}
                  {...props}
                >
                  {codeText}
                </SyntaxHighlighter>
              </div>
            )
          }
          return (
            <code style={styles.inlineCode} {...props}>
              {children}
            </code>
          )
        },
        p:          ({ children }) => <p style={styles.p}>{children}</p>,
        h1:         ({ children }) => <h1 style={styles.h1}>{children}</h1>,
        h2:         ({ children }) => <h2 style={styles.h2}>{children}</h2>,
        h3:         ({ children }) => <h3 style={styles.h3}>{children}</h3>,
        ul:         ({ children }) => <ul style={styles.ul}>{children}</ul>,
        ol:         ({ children }) => <ol style={styles.ol}>{children}</ol>,
        li:         ({ children }) => <li style={styles.li}>{children}</li>,
        blockquote: ({ children }) => <blockquote style={styles.blockquote}>{children}</blockquote>,
        table:      ({ children }) => <div style={styles.tableWrap}><table style={styles.table}>{children}</table></div>,
        th:         ({ children }) => <th style={styles.th}>{children}</th>,
        td:         ({ children }) => <td style={styles.td}>{children}</td>,
        a:          ({ href, children }) => <a href={href} style={styles.a} target="_blank" rel="noreferrer">{children}</a>,
        hr:         () => <hr style={styles.hr} />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

const styles = {
  p:  { margin: '0 0 10px', lineHeight: 1.7, color: 'var(--tx)' },
  h1: { fontSize: 20, fontWeight: 600, margin: '16px 0 8px',  color: 'var(--tx)',  fontFamily: "'DM Sans', sans-serif" },
  h2: { fontSize: 17, fontWeight: 600, margin: '14px 0 6px',  color: 'var(--tx)',  fontFamily: "'DM Sans', sans-serif" },
  h3: { fontSize: 15, fontWeight: 600, margin: '12px 0 4px',  color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif" },
  ul: { margin: '4px 0 10px', paddingLeft: 20, color: 'var(--tx)' },
  ol: { margin: '4px 0 10px', paddingLeft: 20, color: 'var(--tx)' },
  li: { margin: '3px 0', lineHeight: 1.6 },
  blockquote: {
    margin: '8px 0', padding: '8px 14px',
    borderLeft: '3px solid var(--ac)', background: 'var(--bg5)',
    color: 'var(--tx3)', borderRadius: '0 6px 6px 0'
  },
  inlineCode: {
    fontFamily: "'Berkeley Mono', monospace",
    fontSize: 12, background: 'var(--bg5)',
    padding: '2px 6px', borderRadius: 4, color: 'var(--ac2)'
  },
  codeBlock:  { margin: '10px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--bd2)' },
  codeHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--bg5)', padding: '6px 12px', borderBottom: '1px solid var(--bd2)'
  },
  codeLang: { fontSize: 11, color: 'var(--ac)', fontFamily: "'Berkeley Mono', monospace", textTransform: 'uppercase', letterSpacing: 1 },
  copyBtn: {
    background: 'transparent', border: '1px solid var(--bd2)', borderRadius: 4,
    padding: '3px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
  },
  highlighter: { margin: 0, borderRadius: 0, fontSize: 13, background: 'var(--bg3)' },
  tableWrap: { overflowX: 'auto', margin: '8px 0' },
  table:     { borderCollapse: 'collapse', width: '100%', fontSize: 13 },
  th:        { padding: '7px 12px', background: 'var(--bg5)', color: 'var(--tx2)', textAlign: 'left', borderBottom: '1px solid var(--bd2)' },
  td:        { padding: '6px 12px', borderBottom: '1px solid var(--bd)', color: 'var(--tx)' },
  a:         { color: 'var(--ac2)', textDecoration: 'none' },
  hr:        { border: 'none', borderTop: '1px solid var(--bd2)', margin: '12px 0' },
}
