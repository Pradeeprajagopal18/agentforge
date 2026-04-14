import React, { useImperativeHandle, forwardRef } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useVoiceInput } from '../hooks/useVoiceInput.js'

/**
 * VoiceButton — mic button that appends dictated speech to the input.
 * Props:
 *   onTranscript(text)  — called when a final result arrives
 *   onInterim(text)     — called with live partial transcript
 *   disabled            — greyed out when streaming
 */
const VoiceButton = forwardRef(function VoiceButton({ onTranscript, onInterim, disabled }, ref) {
  const { supported, listening, transcript, toggle } = useVoiceInput({
    onResult:  onTranscript,
    onInterim,
  })

  // Expose toggle to parent via ref (for Space-to-record)
  useImperativeHandle(ref, () => ({ toggle, listening, supported }), [toggle, listening, supported])

  if (!supported) return null

  return (
    <div style={s.wrap}>
      <button
        style={{
          ...s.btn,
          ...(listening ? s.btnActive : {}),
          ...(disabled  ? s.btnDisabled : {}),
        }}
        onClick={toggle}
        disabled={disabled}
        title={listening ? 'Stop recording (Space)' : 'Start voice input (Space)'}
      >
        {listening
          ? <MicOff size={15} color="#f87171" />
          : <Mic    size={15} color="#888" />
        }
      </button>

      {/* Live transcript preview */}
      {listening && transcript && (
        <div style={s.preview}>
          <span style={s.previewDot} />
          <span style={s.previewText}>{transcript}</span>
        </div>
      )}

      {/* Recording ring */}
      {listening && <div style={s.ring} />}

      <style>{`
        @keyframes ring-pulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  )
})

export default VoiceButton

const s = {
  wrap: { position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 },

  btn: {
    background: 'none', border: '1px solid var(--bd)', borderRadius: 10,
    padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
    transition: 'all 0.15s', position: 'relative', zIndex: 1,
  },
  btnActive: {
    background: '#1a0a0a', borderColor: '#3a1a1a',
  },
  btnDisabled: { opacity: 0.35, cursor: 'not-allowed' },

  ring: {
    position: 'absolute', inset: -3, borderRadius: 13,
    border: '2px solid #f87171',
    animation: 'ring-pulse 1.2s ease-out infinite',
    pointerEvents: 'none',
  },

  preview: {
    position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
    background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 8,
    padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap', maxWidth: 280, zIndex: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },
  previewDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#f87171',
    flexShrink: 0, animation: 'ring-pulse 1s ease-out infinite',
  },
  previewText: {
    fontSize: 12, color: 'var(--tx2)', fontFamily: "'DM Sans', sans-serif",
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
}
