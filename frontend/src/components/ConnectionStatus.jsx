import React from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'

export default function ConnectionStatus({ connected, reconnecting }) {
  if (connected && !reconnecting) return null

  return (
    <div style={{
      ...s.bar,
      background: reconnecting ? '#1a1200' : '#1a0808',
      borderColor: reconnecting ? '#3a2a00' : '#3a0808',
    }}>
      {reconnecting ? (
        <>
          <RefreshCw size={12} color="#facc15" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ ...s.text, color: '#facc15' }}>Reconnecting to backend…</span>
        </>
      ) : (
        <>
          <WifiOff size={12} color="#f87171" />
          <span style={{ ...s.text, color: '#f87171' }}>Disconnected — check backend is running</span>
        </>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const s = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '6px 16px', borderBottom: '1px solid',
    flexShrink: 0, fontSize: 12, fontFamily: "'DM Sans', sans-serif",
  },
  text: { fontSize: 12 },
}
