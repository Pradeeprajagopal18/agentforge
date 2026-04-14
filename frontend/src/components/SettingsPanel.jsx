import { API } from '../config.js'
import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Save, Server, Cpu, Terminal, FolderOpen, MessageSquare, ChevronDown, ChevronUp, AlertCircle, CheckCircle, BookOpen, KeyRound, ShieldCheck, Palette, Sun, Moon, Type } from 'lucide-react'
import { useTheme } from '../ThemeContext.jsx'
import { ACCENT_COLORS, FONT_SIZES } from '../theme.js'



const MODELS = [
  { value: '', label: 'Default (Claude Sonnet)' },
  { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 — most capable' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 — balanced' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest' },
]

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']
const ALL_TOOLS     = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch']

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={s.section}>
      <button style={s.sectionHeader} onClick={() => setOpen(o => !o)}>
        <div style={s.sectionLeft}>
          <Icon size={14} color="#7c6af7" />
          <span style={s.sectionTitle}>{title}</span>
        </div>
        {open ? <ChevronUp size={13} color="#444" /> : <ChevronDown size={13} color="#444" />}
      </button>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  )
}

export default function SettingsPanel({ onClose }) {
  const { mode, setMode, accent, setAccent, fontSize, setFontSize } = useTheme()
  const [settings, setSettings]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState(null)
  const [authStatus,  setAuthStatus]  = useState(null)
  const [newMcpName, setNewMcpName] = useState('')
  const [newMcpCmd,  setNewMcpCmd]  = useState('')
  const [newMcpArgs, setNewMcpArgs] = useState('')
  const [newMcpEnv,  setNewMcpEnv]  = useState('')

  useEffect(() => {
    // Fetch auth status from /health
    fetch(`${API}/health`)
      .then(r => r.json())
      .then(d => setAuthStatus(d))
      .catch(() => setAuthStatus({ auth_method: 'unknown', auth_detail: 'Could not reach backend' }))
    fetch(`${API}/settings`)
      .then(r => r.json())
      .then(setSettings)
      .catch(() => setSettings({
        model: '',
        system_prompt: '',
        working_dir: '~',
        allowed_tools: DEFAULT_TOOLS,
        mcp_servers: {},
      }))
  }, [])

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const toggleTool = (tool) => {
    const tools = settings.allowed_tools.includes(tool)
      ? settings.allowed_tools.filter(t => t !== tool)
      : [...settings.allowed_tools, tool]
    set('allowed_tools', tools)
  }

  const addMcp = () => {
    if (!newMcpName.trim() || !newMcpCmd.trim()) return
    const args = newMcpArgs.trim() ? newMcpArgs.split(' ').filter(Boolean) : []
    let envObj = {}
    try { if (newMcpEnv.trim()) envObj = JSON.parse(newMcpEnv) } catch {}
    const server = { command: newMcpCmd.trim(), args }
    if (Object.keys(envObj).length) server.env = envObj
    set('mcp_servers', { ...settings.mcp_servers, [newMcpName.trim()]: server })
    setNewMcpName(''); setNewMcpCmd(''); setNewMcpArgs(''); setNewMcpEnv('')
  }

  const removeMcp = (name) => {
    const s = { ...settings.mcp_servers }
    delete s[name]
    set('mcp_servers', s)
  }

  const save = async () => {
    setSaving(true); setError(null); setSaved(false)
    try {
      const r = await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!r.ok) throw new Error(await r.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.loading}>Loading settings…</div>
      </div>
    </div>
  )

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.headerTitle}>Settings</span>
          <button style={s.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={s.body}>

          {/* ── Appearance ── */}
          <Section title="Appearance" icon={Palette}>
            <label style={s.label}>Theme</label>
            <div style={s.modeRow}>
              <button
                style={{ ...s.modeBtn, ...(mode === 'dark' ? s.modeBtnActive : {}) }}
                onClick={() => setMode('dark')}
              >
                <Moon size={14} color={mode === 'dark' ? 'var(--ac)' : 'var(--tx4)'} />
                <span>Dark</span>
              </button>
              <button
                style={{ ...s.modeBtn, ...(mode === 'light' ? s.modeBtnActive : {}) }}
                onClick={() => setMode('light')}
              >
                <Sun size={14} color={mode === 'light' ? 'var(--ac)' : 'var(--tx4)'} />
                <span>Light</span>
              </button>
            </div>

            <label style={{ ...s.label, marginTop: 12 }}>Accent Color</label>
            <div style={s.accentRow}>
              {ACCENT_COLORS.map(ac => (
                <button
                  key={ac.id}
                  title={ac.name}
                  style={{
                    ...s.accentBtn,
                    background: ac.color,
                    boxShadow: accent === ac.id ? `0 0 0 2px var(--bg2), 0 0 0 4px ${ac.color}` : 'none',
                  }}
                  onClick={() => setAccent(ac.id)}
                />
              ))}
            </div>

            <label style={{ ...s.label, marginTop: 12 }}>Font Size</label>
            <div style={s.fontRow}>
              {FONT_SIZES.map(f => (
                <button
                  key={f.id}
                  style={{ ...s.fontBtn, ...(fontSize === f.id ? s.fontBtnActive : {}) }}
                  onClick={() => setFontSize(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Authentication ── */}
          <Section title="Authentication" icon={KeyRound}>
            {authStatus && (
              <div style={s.authStatus}>
                <div style={{
                  ...s.authBadge,
                  background: authStatus.auth_method === 'none' ? '#1a0808' : '#0a180a',
                  borderColor: authStatus.auth_method === 'none' ? '#3a1a1a' : '#1a3a1a',
                }}>
                  <ShieldCheck size={13} color={authStatus.auth_method === 'none' ? '#f87171' : '#4ade80'} />
                  <div>
                    <div style={{ ...s.authMethod, color: authStatus.auth_method === 'none' ? '#f87171' : '#4ade80' }}>
                      {authStatus.auth_method === 'none' ? 'Not authenticated' : `Auth: ${authStatus.auth_method.replace('_', ' ')}`}
                    </div>
                    <div style={s.authDetail}>{authStatus.auth_detail}</div>
                  </div>
                </div>
              </div>
            )}
            <p style={s.hint}>
              AgentForge uses Claude Code for all AI — it handles authentication itself.
              Choose <strong>one</strong> method (in priority order):
            </p>
            <div style={s.authMethods}>
              {[
                { label: 'ANTHROPIC_API_KEY', desc: 'Recommended. Set in backend/.env. Billed per token via Anthropic Console.' },
                { label: 'claude /login', desc: 'Run this in your terminal to authenticate with your Claude.ai subscription (Pro/Max/Team). Credentials stored in your keychain.' },
                { label: 'CLAUDE_CODE_OAUTH_TOKEN', desc: 'Long-lived token from `claude setup-token`. Good for servers/CI.' },
                { label: 'ANTHROPIC_AUTH_TOKEN', desc: 'Bearer token for LLM gateway or proxy setups.' },
                { label: 'CLAUDE_CODE_USE_BEDROCK=1', desc: 'Use AWS Bedrock with your standard AWS credential chain.' },
                { label: 'CLAUDE_CODE_USE_VERTEX=1', desc: 'Use Google Cloud Vertex AI.' },
              ].map((m, i) => (
                <div key={i} style={s.authRow}>
                  <code style={s.authCode}>{m.label}</code>
                  <span style={s.authDesc}>{m.desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Model ── */}
          <Section title="Model" icon={Cpu}>
            <label style={s.label}>Claude Model</label>
            <select
              style={s.select}
              value={settings.model}
              onChange={e => set('model', e.target.value)}
            >
              {MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p style={s.hint}>New conversations will use this model. Restart active sessions to apply.</p>
          </Section>

          {/* ── System Prompt ── */}
          <Section title="System Prompt" icon={MessageSquare} defaultOpen={false}>
            <label style={s.label}>Custom system prompt</label>
            <textarea
              style={s.textarea}
              value={settings.system_prompt}
              onChange={e => set('system_prompt', e.target.value)}
              placeholder="You are a helpful senior platform engineer assistant..."
              rows={4}
            />
            <p style={s.hint}>Applied to every new conversation. Leave blank for Claude's default.</p>
          </Section>

          {/* ── Working Dir ── */}
          <Section title="Working Directory" icon={FolderOpen} defaultOpen={false}>
            <label style={s.label}>Default working directory</label>
            <input
              style={s.input}
              value={settings.working_dir}
              onChange={e => set('working_dir', e.target.value)}
              placeholder="~/projects"
            />
            <p style={s.hint}>Claude Code will use this as the root context for file operations.</p>
          </Section>

          {/* ── Integrations ── */}
          <Section title="Integrations" icon={KeyRound} defaultOpen={false}>
            <label style={s.label}>GitHub Token</label>
            <input
              style={s.input}
              type="password"
              value={settings.github_token || ''}
              onChange={e => set('github_token', e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            />
            <p style={s.hint}>
              Personal access token for fetching PR diffs in the PR Reviewer. Also used by the GitHub MCP server if configured.
              Create one at <strong>github.com → Settings → Developer settings → Personal access tokens</strong> (needs <code>repo</code> scope).
            </p>
          </Section>

          {/* ── Team Prompts ── */}
          <Section title="Team Prompt Library" icon={BookOpen} defaultOpen={false}>
            <label style={s.label}>Team prompts path</label>
            <input
              style={s.input}
              value={settings.team_prompts_path || ''}
              onChange={e => set('team_prompts_path', e.target.value)}
              placeholder="~/shared/team-prompts/prompts.yaml or /mnt/shared/prompts.yaml"
            />
            <p style={s.hint}>Path to a shared prompts.yaml file. Can be a network mount, git repo path, or local file. Team members edit this file to share prompts with the whole team.</p>
          </Section>


          {/* ── Allowed Tools ── */}
          <Section title="Allowed Tools" icon={Terminal} defaultOpen={false}>
            <label style={s.label}>Tools Claude can use</label>
            <div style={s.toolGrid}>
              {ALL_TOOLS.map(tool => {
                const active = settings.allowed_tools.includes(tool)
                return (
                  <button
                    key={tool}
                    style={{ ...s.toolChip, ...(active ? s.toolChipOn : s.toolChipOff) }}
                    onClick={() => toggleTool(tool)}
                  >
                    {tool}
                  </button>
                )
              })}
            </div>
            <p style={s.hint}>Removing tools restricts what Claude can do without prompting.</p>
          </Section>

          {/* ── MCP Servers ── */}
          <Section title="MCP Servers" icon={Server}>
            {/* Existing servers */}
            {Object.keys(settings.mcp_servers).length === 0 && (
              <p style={s.emptyMcp}>No MCP servers configured. Add one below.</p>
            )}
            {Object.entries(settings.mcp_servers).map(([name, srv]) => (
              <div key={name} style={s.mcpRow}>
                <div style={s.mcpInfo}>
                  <span style={s.mcpName}>{name}</span>
                  <span style={s.mcpCmd}>{srv.command} {(srv.args || []).join(' ')}</span>
                </div>
                <button style={s.mcpDel} onClick={() => removeMcp(name)}>
                  <Trash2 size={12} color="#f87171" />
                </button>
              </div>
            ))}

            {/* Add new server */}
            <div style={s.mcpAdd}>
              <p style={{ ...s.label, marginBottom: 8 }}>Add MCP Server</p>
              <div style={s.mcpFields}>
                <input style={s.input} placeholder="Server name (e.g. filesystem)" value={newMcpName} onChange={e => setNewMcpName(e.target.value)} />
                <input style={s.input} placeholder="Command (e.g. npx)" value={newMcpCmd} onChange={e => setNewMcpCmd(e.target.value)} />
                <input style={s.input} placeholder="Args (e.g. -y @modelcontextprotocol/server-filesystem /path)" value={newMcpArgs} onChange={e => setNewMcpArgs(e.target.value)} />
                <input style={s.input} placeholder='Env JSON (optional, e.g. {"TOKEN":"abc"})' value={newMcpEnv} onChange={e => setNewMcpEnv(e.target.value)} />
              </div>
              <button style={s.addBtn} onClick={addMcp}>
                <Plus size={13} /> Add Server
              </button>
            </div>

            <div style={s.mcpPreview}>
              <p style={s.label}>Preview (mcp.json)</p>
              <pre style={s.mcpJson}>
                {JSON.stringify({ mcpServers: settings.mcp_servers }, null, 2)}
              </pre>
            </div>
          </Section>

        </div>

        {/* Footer */}
        <div style={s.footer}>
          {error && (
            <div style={s.errorMsg}><AlertCircle size={13} /> {error}</div>
          )}
          {saved && (
            <div style={s.savedMsg}><CheckCircle size={13} /> Settings saved!</div>
          )}
          <div style={s.footerBtns}>
            <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={s.saveBtn} onClick={save} disabled={saving}>
              <Save size={13} /> {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    backdropFilter: 'blur(4px)'
  },
  panel: {
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 14,
    width: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid var(--bd)'
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'var(--tx)', fontFamily: "'DM Sans', sans-serif" },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx4)', padding: 4 },
  body: { flex: 1, overflowY: 'auto', padding: '12px 0' },
  loading: { padding: 40, textAlign: 'center', color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace", fontSize: 13 },

  section: { borderBottom: '1px solid var(--bd)' },
  sectionHeader: {
    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 20px'
  },
  sectionLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: 500, color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif" },
  sectionBody: { padding: '4px 20px 16px' },

  label: { fontSize: 11, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: "'Berkeley Mono', monospace", display: 'block', marginBottom: 6 },
  hint: { fontSize: 11, color: 'var(--tx5)', marginTop: 6, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 },

  input: {
    width: '100%', background: 'var(--bg3)', color: 'var(--tx2)', border: '1px solid var(--bd2)',
    borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'Berkeley Mono', monospace",
    outline: 'none', boxSizing: 'border-box'
  },
  select: {
    width: '100%', background: 'var(--bg3)', color: 'var(--tx2)', border: '1px solid var(--bd2)',
    borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', cursor: 'pointer'
  },
  textarea: {
    width: '100%', background: 'var(--bg3)', color: 'var(--tx2)', border: '1px solid var(--bd2)',
    borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5
  },

  toolGrid: { display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  toolChip: {
    padding: '5px 12px', borderRadius: 20, fontSize: 12,
    fontFamily: "'Berkeley Mono', monospace", cursor: 'pointer', border: '1px solid',
    transition: 'all 0.15s'
  },
  toolChipOn:  { background: 'var(--bg4)', borderColor: 'var(--ac)', color: 'var(--ac2)' },
  toolChipOff: { background: 'var(--bg3)', borderColor: 'var(--bd)', color: 'var(--tx4)' },

  emptyMcp: { fontSize: 12, color: 'var(--tx5)', fontFamily: "'DM Sans', sans-serif", marginBottom: 12 },
  mcpRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8,
    padding: '8px 12px', marginBottom: 6
  },
  mcpInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  mcpName: { fontSize: 12, fontWeight: 600, color: 'var(--ac2)', fontFamily: "'Berkeley Mono', monospace" },
  mcpCmd: { fontSize: 11, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace" },
  mcpDel: { background: 'none', border: 'none', cursor: 'pointer', padding: 4 },

  mcpAdd: { marginTop: 12, padding: 12, background: 'var(--bg1)', borderRadius: 8, border: '1px solid var(--bd)' },
  mcpFields: { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg4)',
    border: '1px solid var(--bd3)', color: 'var(--ac2)', borderRadius: 7,
    padding: '7px 14px', fontSize: 12, cursor: 'pointer',
    fontFamily: "'Berkeley Mono', monospace"
  },
  mcpPreview: { marginTop: 14 },
  mcpJson: {
    background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 7,
    padding: 10, fontSize: 11, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace",
    overflowX: 'auto', maxHeight: 120, marginTop: 6
  },

  footer: { padding: '12px 20px', borderTop: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 8 },
  footerBtns: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  authStatus:  { marginBottom: 10 },
  authBadge:   { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', borderRadius: 8, border: '1px solid' },
  authMethod:  { fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" },
  authDetail:  { fontSize: 11, color: 'var(--tx3)', fontFamily: "'Berkeley Mono', monospace", marginTop: 2 },
  authMethods: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 },
  authRow:     { display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 10px', background: 'var(--bg1)', borderRadius: 6, border: '1px solid var(--bd)' },
  authCode:    { fontSize: 11, color: 'var(--ac2)', fontFamily: "'Berkeley Mono', monospace" },
  authDesc:    { fontSize: 11, color: 'var(--tx4)', fontFamily: "'DM Sans', sans-serif" },
  cancelBtn: {
    background: 'none', border: '1px solid var(--bd2)', color: 'var(--tx3)',
    borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13,
    fontFamily: "'DM Sans', sans-serif"
  },
  saveBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ac)',
    border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px',
    cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500
  },
  errorMsg: { display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 12 },
  savedMsg: { display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: 12 },

  // Appearance section
  modeRow: { display: 'flex', gap: 8, marginBottom: 4 },
  modeBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--bd)',
    borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--tx3)',
    fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
  },
  modeBtnActive: { background: 'var(--bg4)', borderColor: 'var(--ac)', color: 'var(--tx)' },

  accentRow: { display: 'flex', gap: 8, marginBottom: 4 },
  accentBtn: {
    width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
    transition: 'box-shadow 0.15s', flexShrink: 0,
  },

  fontRow: { display: 'flex', gap: 6 },
  fontBtn: {
    flex: 1, padding: '6px 8px', background: 'var(--bg3)', border: '1px solid var(--bd)',
    borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--tx3)',
    fontFamily: "'Berkeley Mono', monospace", transition: 'all 0.15s',
  },
  fontBtnActive: { background: 'var(--bg4)', borderColor: 'var(--ac)', color: 'var(--ac)' },
}
