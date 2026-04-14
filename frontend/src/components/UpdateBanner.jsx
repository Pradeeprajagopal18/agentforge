import React, { useState } from 'react'
import { Download, X, RefreshCw, ArrowUpCircle } from 'lucide-react'

/**
 * UpdateBanner — shown when electron-updater signals an available or
 * downloaded update. Receives updateInfo from the preload IPC bridge.
 */
export default function UpdateBanner({ info, downloaded, onInstall, onDismiss }) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = () => {
    setInstalling(true)
    onInstall?.()
  }

  if (!info) return null

  return (
    <div style={s.banner}>
      <div style={s.left}>
        {downloaded
          ? <ArrowUpCircle size={14} color="#4ade80" />
          : <Download size={14} color="#60a5fa" />
        }
        <div style={s.text}>
          {downloaded ? (
            <>
              <span style={s.title}>Update ready — v{info.version}</span>
              <span style={s.sub}>Restart to apply the latest improvements</span>
            </>
          ) : (
            <>
              <span style={s.title}>Update available — v{info.version}</span>
              <span style={s.sub}>Downloading in the background…</span>
            </>
          )}
        </div>
      </div>

      <div style={s.right}>
        {downloaded && (
          <button style={s.installBtn} onClick={handleInstall} disabled={installing}>
            <RefreshCw size={12} style={installing ? { animation: 'spin 1s linear infinite' } : {}} />
            {installing ? 'Restarting…' : 'Restart & Update'}
          </button>
        )}
        <button style={s.dismissBtn} onClick={onDismiss} title="Dismiss">
          <X size={13} color="#555" />
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const s = {
  banner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
    flexShrink: 0, gap: 12, zIndex: 10,
  },
  left: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  text: { display: 'flex', flexDirection: 'column', gap: 1 },
  title: { fontSize: 12, fontWeight: 500, color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif" },
  sub:   { fontSize: 11, color: 'var(--tx4)', fontFamily: "'Berkeley Mono', monospace" },
  right: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  installBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#1a3a1a', border: '1px solid #2a5a2a', borderRadius: 7,
    color: '#4ade80', padding: '5px 12px', cursor: 'pointer',
    fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
  },
  dismissBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '3px', display: 'flex', alignItems: 'center',
  },
}
