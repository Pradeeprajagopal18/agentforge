import { API } from './config.js'
import { useTheme } from './ThemeContext.jsx'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Square, Send, DollarSign, Settings, Download, Keyboard, BookOpen, GitPullRequest, Code2, GitBranch } from 'lucide-react'
import Sidebar from './components/Sidebar.jsx'
import MarkdownRenderer from './components/MarkdownRenderer.jsx'
import ToolCallBlock from './components/ToolCallBlock.jsx'
import FileAttachment from './components/FileAttachment.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import CostPanel from './components/CostPanel.jsx'
import SmartInput from './components/SmartInput.jsx'
import ExportModal from './components/ExportModal.jsx'
import ConversationTitle from './components/ConversationTitle.jsx'
import ShortcutsOverlay from './components/ShortcutsOverlay.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'
import PromptLibrary from './components/PromptLibrary.jsx'
import ArtifactsPanel from './components/ArtifactsPanel.jsx'
import PRReviewer from './components/PRReviewer.jsx'
import VoiceButton from './components/VoiceButton.jsx'
import BranchButton from './components/BranchButton.jsx'
import ConnectionStatus from './components/ConnectionStatus.jsx'
import { useElectron } from './hooks/useElectron.js'
import { useWebSocket } from './hooks/useWebSocket.js'
import { extractArtifacts } from './utils/artifactDetector.js'



function newConvId() { return crypto.randomUUID() }

function CostBadge({ cost }) {
  if (!cost) return null
  return (
    <span style={cbs}>
      <DollarSign size={9} />
      {cost < 0.01 ? '<$0.01' : `$${cost.toFixed(4)}`}
    </span>
  )
}
const cbs = {
  display:'inline-flex', alignItems:'center', gap:2, fontSize:10, color:'var(--tx5)',
  fontFamily:"'Berkeley Mono',monospace", background:'var(--bg2)', padding:'2px 6px',
  borderRadius:10, border:'1px solid var(--bd)', marginTop:4,
}

// ── Feature card for welcome screen ──────────────────────────────
function FeatureCard({ icon, label, shortcut, color, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      style={{ ...fc.card, ...(hov ? { borderColor: color + '55', background: color + '08' } : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={fc.label}>{label}</span>
      <kbd style={{ ...fc.kbd, color, borderColor: color + '44', background: color + '11' }}>{shortcut}</kbd>
    </button>
  )
}
const fc = {
  card: { display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'16px 14px', background:'var(--bg2)', border:'1px solid var(--bd)', borderRadius:12, cursor:'pointer', transition:'all 0.15s', minWidth:110 },
  label: { fontSize:12, color:'var(--tx2)', fontFamily:"'DM Sans',sans-serif" },
  kbd:   { fontSize:10, padding:'2px 7px', borderRadius:4, border:'1px solid', fontFamily:"'Berkeley Mono',monospace" },
}

export default function App() {
  const { fontScale } = useTheme()
  const [conversations, setConversations] = useState([])
  const [activeId,      setActiveId]      = useState(null)
  const [messages,      setMessages]      = useState([])
  const [input,         setInput]         = useState('')
  const [attachments,   setAttachments]   = useState([])
  const [streaming,     setStreaming]     = useState(false)
  const [toolCalls,     setToolCalls]     = useState([])
  const [showSettings,  setShowSettings]  = useState(false)
  const [showCost,      setShowCost]      = useState(false)
  const [showExport,    setShowExport]    = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showPrompts,   setShowPrompts]   = useState(false)
  const [showPRReview,  setShowPRReview]  = useState(false)
  const [showArtifacts, setShowArtifacts] = useState(true)
  const [wsConnected,   setWsConnected]   = useState(true)  // optimistic — flips false on disconnect
  const [wsReconnecting,setWsReconnecting]= useState(false)
  const [hoveredMsgIdx, setHoveredMsgIdx] = useState(null)

  const toolCallsRef = useRef([])
  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const voiceRef     = useRef(null)   // VoiceButton imperative handle

  // Keep toolCallsRef in sync for closure capture
  useEffect(() => { toolCallsRef.current = toolCalls }, [toolCalls])

  // ── Electron IPC ───────────────────────────────────────────────
  const { isElectron, version, updateInfo, updateDownloaded, installUpdate, dismissUpdate } = useElectron({
    onNewConversation:    () => newConv(),
    onOpenSettings:       () => setShowSettings(true),
    onOpenShortcuts:      () => setShowShortcuts(true),
    onExportConversation: () => setShowExport(true),
  })

  // ── Artifacts from latest assistant message ─────────────────────
  const latestArtifacts = useMemo(() => {
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    return last?.text ? extractArtifacts(last.text) : []
  }, [messages])

  useEffect(() => { if (latestArtifacts.length > 0) setShowArtifacts(true) }, [latestArtifacts.length])

  // ── WebSocket with auto-reconnect ──────────────────────────────
  const handleMessage = useCallback((event) => {
    if (event.type === '__ping__') return

    if (event.type === 'assistant') {
      const blocks   = event.message?.content || []
      const text     = blocks.filter(b => b.type === 'text').map(b => b.text).join('')
      const newTools = blocks.filter(b => b.type === 'tool_use').map(b => ({ name: b.name, input: b.input }))
      if (newTools.length) {
        setToolCalls(prev => { toolCallsRef.current = [...prev, ...newTools]; return toolCallsRef.current })
      }
      if (text) {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant' && last.streaming)
            return [...prev.slice(0, -1), { ...last, text: last.text + text }]
          return [...prev, { role: 'assistant', text, streaming: true, toolCalls: [] }]
        })
      }
    }

    if (event.type === 'result') {
      const cost = event.cost_usd
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant')
          return [...prev.slice(0, -1), { ...last, streaming: false, cost, toolCalls: toolCallsRef.current }]
        return prev
      })
      setToolCalls([]); setStreaming(false)
      // Refresh conversations (title may have been auto-generated)
      setTimeout(() => {
        fetch(`${API}/conversations`).then(r => r.json()).then(setConversations).catch(() => {})
      }, 1500)
    }

    if (event.type === 'title_update') {
      setConversations(prev => prev.map(c =>
        c.id === event.conv_id ? { ...c, title: event.title } : c
      ))
    }

    if (event.type === 'error' || event.type === 'interrupted') {
      setStreaming(false); setToolCalls([])
      if (event.type === 'error')
        setMessages(prev => [...prev, { role: 'error', text: event.message || 'An error occurred' }])
    }
  }, [])

  const { send: wsSend, close: wsClose } = useWebSocket(activeId, {
    onMessage:    handleMessage,
    onConnect:    () => { setWsConnected(true);  setWsReconnecting(false) },
    onDisconnect: () => { setWsConnected(false); setWsReconnecting(false) },
    onError:      () => { setWsReconnecting(true) },
  })

  // ── Load conversations on mount ────────────────────────────────
  useEffect(() => {
    fetch(`${API}/conversations`).then(r => r.json()).then(setConversations).catch(() => {})
  }, [])

  // ── Auto-scroll ────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'

      if (mod && e.key === 'k')             { e.preventDefault(); newConv() }
      if (mod && e.key === ',')             { e.preventDefault(); setShowSettings(s => !s) }
      if (mod && e.key === '/')             { e.preventDefault(); setShowShortcuts(s => !s) }
      if (mod && e.key === 'e' && activeId) { e.preventDefault(); setShowExport(s => !s) }
      if (mod && e.key === 'p')             { e.preventDefault(); setShowPrompts(s => !s) }
      if (mod && e.key === 'r')             { e.preventDefault(); setShowPRReview(s => !s) }
      if (mod && e.key === 'b' && latestArtifacts.length > 0) { e.preventDefault(); setShowArtifacts(s => !s) }
      if (mod && e.key === 'f') { e.preventDefault(); /* sidebar search handled inside Sidebar */ }

      if (e.key === 'Escape') {
        if (showPrompts)   { setShowPrompts(false);   return }
        if (showPRReview)  { setShowPRReview(false);  return }
        if (showShortcuts) { setShowShortcuts(false); return }
        if (showSettings)  { setShowSettings(false);  return }
        if (showExport)    { setShowExport(false);    return }
        setShowCost(false)
        if (streaming) wsSend({ type: 'interrupt' })
      }

      if (e.key === '/' && inInput && input === '') {
        e.preventDefault(); setShowPrompts(true)
      }

      // Space-to-record voice (when input focused, no modifier, nothing typed yet)
      if (e.code === 'Space' && inInput && !mod && !e.shiftKey && input === '' && activeId) {
        e.preventDefault()
        voiceRef.current?.toggle()
      }

      if (mod && e.shiftKey && e.key === 'C') {
        const last = [...messages].reverse().find(m => m.role === 'assistant')
        if (last?.text) navigator.clipboard.writeText(last.text)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeId, streaming, messages, showPrompts, showPRReview, showShortcuts, showSettings, showExport, input, latestArtifacts, wsSend, voiceRef])

  // ── Conversation actions ───────────────────────────────────────
  const selectConv = async (id) => {
    setActiveId(id)
    setStreaming(false); setToolCalls([])
    try {
      const msgs = await fetch(`${API}/conversations/${id}/messages`).then(r => r.json())
      setMessages(msgs.map(m => ({
        id: m.id, role: m.role, text: m.content,
        toolCalls: m.tool_calls || [], cost: m.cost_usd, streaming: false,
      })))
    } catch { setMessages([]) }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const newConv = useCallback(() => {
    const id = newConvId()
    setActiveId(id); setMessages([]); setAttachments([]); setInput('')
    setStreaming(false); setToolCalls([])
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const deleteConv = async (id) => {
    await fetch(`${API}/conversations/${id}`, { method: 'DELETE' })
    setConversations(prev => prev.filter(c => c.id !== id))
    if (id === activeId) { setActiveId(null); setMessages([]) }
  }

  const handleRenamed = (newTitle) => {
    setConversations(prev => prev.map(c => c.id === activeId ? { ...c, title: newTitle } : c))
  }

  const handleBranched = (newConv) => {
    setConversations(prev => [newConv, ...prev])
    // Switch to the new branch
    selectConv(newConv.id)
  }

  const send = () => {
    if ((!input.trim() && !attachments.length) || streaming) return
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId, role: 'user', text: input,
      attachments: attachments.map(a => ({ name: a.name, type: a.type })),
    }])
    wsSend({ message: input, attachments })
    setInput(''); setAttachments([]); setStreaming(true); setToolCalls([])
  }

  const insertPrompt = (text) => {
    setInput(prev => prev ? prev + '\n\n' + text : text)
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  const onMentionAttach = (fileObj) => {
    setAttachments(prev => prev.find(a => a.path === fileObj.path) ? prev : [...prev, fileObj])
  }

  const activeConv  = conversations.find(c => c.id === activeId)
  const sessionCost = messages.filter(m => m.cost).reduce((s, m) => s + (m.cost || 0), 0)
  const hasArtifacts = latestArtifacts.length > 0
  const isStreaming  = streaming || messages.some(m => m.streaming)

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={st.app}>
      <Sidebar
        conversations={conversations} activeId={activeId}
        onSelect={selectConv} onNew={newConv} onDelete={deleteConv}
        onSettings={() => setShowSettings(true)}
      />

      <div style={st.main}>
        <UpdateBanner info={updateInfo} downloaded={updateDownloaded} onInstall={installUpdate} onDismiss={dismissUpdate} />
        <ConnectionStatus connected={wsConnected} reconnecting={wsReconnecting} />

        {!activeId ? (
          // ── Welcome screen ──────────────────────────────────────
          <div style={st.welcome}>
            <div style={st.welcomeGlow} />
            <div style={st.welcomeIcon}>⬡</div>
            <h1 style={st.welcomeTitle}>AgentForge</h1>
            <p style={st.welcomeSub}>
              Powered by Claude Code · All features local
              {isElectron && version ? ` · v${version}` : ''}
            </p>

            <div style={st.featureGrid}>
              <FeatureCard icon="💬" label="New Chat"        shortcut="⌘K" color="#7c6af7" onClick={newConv} />
              <FeatureCard icon="📚" label="Prompt Library" shortcut="⌘P" color="#60a5fa" onClick={() => setShowPrompts(true)} />
              <FeatureCard icon="🔍" label="PR Review"      shortcut="⌘R" color="#f87171" onClick={() => setShowPRReview(true)} />
              <FeatureCard icon="⚙️" label="Settings"       shortcut="⌘," color="#a78bfa" onClick={() => setShowSettings(true)} />
            </div>

            <div style={st.tipRow}>
              <span style={st.tip}>@ to mention files</span>
              <span style={st.tipDot}>·</span>
              <span style={st.tip}>/ for quick prompts</span>
              <span style={st.tipDot}>·</span>
              <span style={st.tip}>⌘B for artifact panel</span>
              <span style={st.tipDot}>·</span>
              <span style={st.tip}>⌘/ for all shortcuts</span>
            </div>
          </div>
        ) : (
          <>
            {/* ── Top bar ── */}
            <div style={st.topBar}>
              <ConversationTitle convId={activeId} title={activeConv?.title} onRenamed={handleRenamed} />
              {activeConv?.parent_id && (
                <span style={st.branchBadge}>
                  <GitBranch size={10} /> branch
                </span>
              )}
              <div style={st.topActions}>
                {sessionCost > 0 && (
                  <button style={st.topBtn} onClick={() => setShowCost(s => !s)} title="Cost">
                    <DollarSign size={12} color="#4ade80" />
                    <span style={st.costLabel}>${sessionCost.toFixed(4)}</span>
                  </button>
                )}
                {hasArtifacts && (
                  <button style={{ ...st.topBtn, ...(showArtifacts ? st.topBtnActive : {}) }}
                    onClick={() => setShowArtifacts(s => !s)} title="Artifacts (⌘B)">
                    <Code2 size={13} color={showArtifacts ? '#a78bfa' : '#555'} />
                    <span style={{ fontSize:11, color: showArtifacts ? '#a78bfa' : '#555' }}>{latestArtifacts.length}</span>
                  </button>
                )}
                <button style={st.topBtn} onClick={() => setShowPrompts(true)}   title="Prompts (⌘P)"><BookOpen size={13} color="#555" /></button>
                <button style={st.topBtn} onClick={() => setShowPRReview(true)}  title="PR Review (⌘R)"><GitPullRequest size={13} color="#555" /></button>
                <button style={st.topBtn} onClick={() => setShowExport(true)}    title="Export (⌘E)"><Download size={13} color="#555" /></button>
                <button style={st.topBtn} onClick={() => setShowShortcuts(true)} title="Shortcuts (⌘/)"><Keyboard size={13} color="#555" /></button>
                <button style={st.topBtn} onClick={() => setShowSettings(true)}  title="Settings (⌘,)"><Settings size={13} color="#555" /></button>
              </div>
            </div>

            {/* ── Chat + Artifacts ── */}
            <div style={st.chatAndArtifacts}>
              <div style={{ ...st.chatArea, zoom: fontScale }}>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={st.messageRow}
                    onMouseEnter={() => setHoveredMsgIdx(i)}
                    onMouseLeave={() => setHoveredMsgIdx(null)}
                  >
                    {msg.role === 'user' && (
                      <div style={st.userWrap}>
                        {/* Branch button — visible on hover */}
                        <div style={{ ...st.branchWrap, opacity: hoveredMsgIdx === i ? 1 : 0 }}>
                          <BranchButton
                            convId={activeId}
                            msgId={msg.id}
                            onBranched={handleBranched}
                          />
                        </div>
                        <div style={st.userBubble}>
                          <span style={st.roleLabel}>you</span>
                          <div style={st.userText}>{msg.text}</div>
                          {msg.attachments?.length > 0 && (
                            <div style={st.attachMeta}>
                              {msg.attachments.map((a, j) => <span key={j} style={st.attachTag}>📎 {a.name}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {msg.role === 'assistant' && (
                      <div style={st.assistantWrap}>
                        <div style={st.assistantHeader}>
                          <span style={st.claudeLabel}>claude</span>
                          {!msg.streaming && msg.text && (
                            <button style={st.copyMsgBtn} onClick={() => navigator.clipboard.writeText(msg.text)}>copy</button>
                          )}
                        </div>
                        {(msg.toolCalls?.length > 0 || (msg.streaming && toolCalls.length > 0)) && (
                          <ToolCallBlock toolCalls={msg.streaming ? toolCalls : msg.toolCalls} />
                        )}
                        <div style={st.assistantBubble}><MarkdownRenderer content={msg.text} /></div>
                        {!msg.streaming && <CostBadge cost={msg.cost} />}
                      </div>
                    )}

                    {msg.role === 'error' && (
                      <div style={st.errorBubble}>⚠ {msg.text}</div>
                    )}
                  </div>
                ))}

                {streaming && !messages.some(m => m.streaming) && (
                  <div style={st.thinking}>
                    <span style={st.dot1}/><span style={st.dot2}/><span style={st.dot3}/>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Artifacts split panel */}
              {showArtifacts && hasArtifacts && (
                <ArtifactsPanel
                  artifacts={latestArtifacts}
                  streaming={isStreaming}
                  onClose={() => setShowArtifacts(false)}
                />
              )}
            </div>

            {/* ── Input ── */}
            <div style={{ ...st.inputArea, zoom: fontScale }}>
              {attachments.length > 0 && (
                <FileAttachment attachments={attachments} setAttachments={setAttachments} />
              )}
              <div style={st.inputRow}>
                <FileAttachment attachments={[]} setAttachments={fn => setAttachments(fn)} />
                <SmartInput
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  disabled={!activeId}
                  placeholder={streaming ? 'Claude is thinking… (Esc to stop)' : 'Message Claude… (/ prompts · @ files · Enter to send)'}
                  inputRef={inputRef}
                  onMentionAttach={onMentionAttach}
                />
                <VoiceButton
                  ref={voiceRef}
                  onTranscript={text => {
                    setInput(prev => {
                      // Remove any interim placeholder and append final
                      const base = prev.replace(/​.*$/, '').trimEnd()
                      return base ? base + ' ' + text : text
                    })
                  }}
                  onInterim={text => {
                    setInput(prev => {
                      // Show live interim with zero-width space marker
                      const base = prev.replace(/​.*$/, '').trimEnd()
                      return base ? base + ' ​' + text : '​' + text
                    })
                  }}
                  disabled={streaming}
                />
                {streaming ? (
                  <button style={st.stopBtn} onClick={() => wsSend({ type: 'interrupt' })} title="Stop (Esc)">
                    <Square size={15} fill="#f87171" color="#f87171" />
                  </button>
                ) : (
                  <button
                    style={{ ...st.sendBtn, opacity: (input.trim() || attachments.length) ? 1 : 0.35 }}
                    onClick={send}
                    disabled={!input.trim() && !attachments.length}
                    title="Send (Enter)"
                  >
                    <Send size={15} />
                  </button>
                )}
              </div>
            </div>

            {showCost && <CostPanel convId={activeId} messages={messages} onClose={() => setShowCost(false)} />}
          </>
        )}
      </div>

      {/* ── Global modals ── */}
      {showSettings  && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showExport && activeId && (
        <ExportModal convId={activeId} convTitle={activeConv?.title} messageCount={messages.length} onClose={() => setShowExport(false)} />
      )}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {showPrompts   && <PromptLibrary onInsert={insertPrompt} onClose={() => setShowPrompts(false)} />}
      {showPRReview  && <PRReviewer onClose={() => setShowPRReview(false)} />}

      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:var(--bg); }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--bd2); border-radius:2px; }
        @keyframes blink  { 0%,100%{opacity:0.2} 50%{opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes glow   { 0%,100%{opacity:0.5} 50%{opacity:1} }
        kbd { background:var(--bg5); border:1px solid var(--bd2); border-radius:4px; padding:1px 5px; font-size:11px; font-family:'Berkeley Mono',monospace; color:var(--tx3); }
        select option { background:var(--bg3); }
        textarea:focus { border-color:var(--ac) !important; }
        button:hover { opacity:0.82 !important; }
        .msg-row:hover .branch-btn { opacity:1 !important; }
      `}</style>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────
const st = {
  app:  { display:'flex', height:'100vh', fontFamily:"'DM Sans',sans-serif", background:'var(--bg)', color:'var(--tx)' },
  main: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' },

  // Welcome
  welcome:      { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:40, position:'relative', overflow:'hidden' },
  welcomeGlow:  { position:'absolute', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, var(--ac) 0%, transparent 70%)', opacity:0.08, pointerEvents:'none', animation:'glow 4s ease-in-out infinite' },
  welcomeIcon:  { fontSize:56, color:'var(--ac)', lineHeight:1, position:'relative' },
  welcomeTitle: { fontSize:32, fontWeight:200, color:'var(--tx)', letterSpacing:-1, position:'relative' },
  welcomeSub:   { fontSize:12, color:'var(--tx4)', fontFamily:"'Berkeley Mono',monospace", position:'relative' },
  featureGrid:  { display:'flex', gap:10, marginTop:8, flexWrap:'wrap', justifyContent:'center', position:'relative' },
  tipRow:       { display:'flex', gap:10, alignItems:'center', marginTop:4 },
  tip:          { fontSize:11, color:'var(--tx5)', fontFamily:"'Berkeley Mono',monospace" },
  tipDot:       { color:'var(--tx5)', fontSize:11 },

  // Top bar
  topBar: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 16px', background:'var(--bg1)', borderBottom:'1px solid var(--bd)', minHeight:44, flexShrink:0, gap:8 },
  topActions:  { display:'flex', alignItems:'center', gap:5, flexShrink:0 },
  topBtn:      { display:'flex', alignItems:'center', gap:5, background:'none', border:'1px solid var(--bd)', borderRadius:7, padding:'4px 8px', cursor:'pointer' },
  topBtnActive:{ background:'var(--bg4)', borderColor:'var(--bd3)' },
  costLabel:   { fontSize:11, color:'#4ade80', fontFamily:"'Berkeley Mono',monospace" },
  branchBadge: { display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--ac)', background:'var(--bg4)', border:'1px solid var(--bd3)', borderRadius:20, padding:'2px 8px', fontFamily:"'Berkeley Mono',monospace", flexShrink:0 },

  // Chat
  chatAndArtifacts: { flex:1, display:'flex', overflow:'hidden' },
  chatArea:   { flex:1, overflowY:'auto', padding:'24px 20px', display:'flex', flexDirection:'column', gap:20 },
  messageRow: { animation:'fadeIn 0.2s ease' },

  userWrap:   { display:'flex', justifyContent:'flex-end', alignItems:'flex-start', gap:6 },
  branchWrap: { display:'flex', alignItems:'center', paddingTop:24, transition:'opacity 0.15s' },
  userBubble: { maxWidth:'72%', background:'var(--bg4)', border:'1px solid var(--bd3)', borderRadius:'14px 14px 2px 14px', padding:'10px 14px' },
  roleLabel:  { fontSize:10, color:'var(--tx4)', textTransform:'uppercase', letterSpacing:1, fontFamily:"'Berkeley Mono',monospace", display:'block', marginBottom:4 },
  userText:   { fontSize:14, lineHeight:1.6, color:'var(--tx)', whiteSpace:'pre-wrap', wordBreak:'break-word' },
  attachMeta: { display:'flex', flexWrap:'wrap', gap:4, marginTop:6 },
  attachTag:  { fontSize:11, color:'var(--ac)', background:'var(--bg5)', padding:'2px 8px', borderRadius:10, fontFamily:"'Berkeley Mono',monospace" },

  assistantWrap:   { maxWidth:'84%', display:'flex', flexDirection:'column', gap:4 },
  assistantHeader: { display:'flex', alignItems:'center', justifyContent:'space-between' },
  claudeLabel:  { fontSize:10, color:'var(--ac)', textTransform:'uppercase', letterSpacing:1, fontFamily:"'Berkeley Mono',monospace" },
  copyMsgBtn:   { background:'none', border:'none', cursor:'pointer', fontSize:10, color:'var(--tx5)', fontFamily:"'Berkeley Mono',monospace", padding:'1px 6px', borderRadius:4 },
  assistantBubble: { fontSize:14, lineHeight:1.7 },
  errorBubble: { background:'#1a0a0a', border:'1px solid #3a1a1a', borderRadius:8, padding:'8px 14px', fontSize:13, color:'#f87171' },

  thinking: { display:'flex', gap:5, padding:'4px 0', alignItems:'center' },
  dot1: { width:6, height:6, borderRadius:'50%', background:'var(--ac)', animation:'blink 1.2s 0.0s infinite' },
  dot2: { width:6, height:6, borderRadius:'50%', background:'var(--ac)', animation:'blink 1.2s 0.2s infinite' },
  dot3: { width:6, height:6, borderRadius:'50%', background:'var(--ac)', animation:'blink 1.2s 0.4s infinite' },

  inputArea: { padding:'12px 16px', background:'var(--bg1)', borderTop:'1px solid var(--bd)', display:'flex', flexDirection:'column', gap:6, flexShrink:0 },
  inputRow:  { display:'flex', gap:8, alignItems:'flex-end' },
  sendBtn: { background:'var(--ac)', color:'#fff', border:'none', borderRadius:10, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', flexShrink:0, transition:'opacity 0.15s' },
  stopBtn: { background:'#1a0a0a', border:'1px solid #3a1a1a', borderRadius:10, padding:'10px 14px', cursor:'pointer', display:'flex', alignItems:'center', flexShrink:0 },
}
