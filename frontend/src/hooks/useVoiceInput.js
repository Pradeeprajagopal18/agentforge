import { useState, useEffect, useRef, useCallback } from 'react'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

/**
 * useVoiceInput — Web Speech API hook.
 * Returns:
 *   supported    — browser supports speech recognition
 *   listening    — currently recording
 *   transcript   — current live transcript (interim)
 *   start()      — begin listening
 *   stop()       — stop listening
 *   toggle()     — start/stop
 */
export function useVoiceInput({ onResult, onInterim, language = 'en-US' } = {}) {
  const [supported,  setSupported]  = useState(false)
  const [listening,  setListening]  = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    if (!SpeechRecognition) return
    setSupported(true)

    const rec = new SpeechRecognition()
    rec.continuous          = true
    rec.interimResults      = true
    rec.maxAlternatives     = 1
    rec.lang                = language

    rec.onresult = (e) => {
      let interim = ''
      let final   = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (interim) {
        setTranscript(interim)
        onInterim?.(interim)
      }
      if (final) {
        setTranscript('')
        onResult?.(final.trim())
      }
    }

    rec.onerror = (e) => {
      if (e.error !== 'aborted') console.warn('[voice]', e.error)
      setListening(false)
      setTranscript('')
    }

    rec.onend = () => {
      setListening(false)
      setTranscript('')
    }

    recognitionRef.current = rec
    return () => rec.abort()
  }, [language])

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {}
  }, [listening])

  const stop = useCallback(() => {
    if (!recognitionRef.current || !listening) return
    recognitionRef.current.stop()
    setListening(false)
  }, [listening])

  const toggle = useCallback(() => {
    listening ? stop() : start()
  }, [listening, start, stop])

  return { supported, listening, transcript, start, stop, toggle }
}
