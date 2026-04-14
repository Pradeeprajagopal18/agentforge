import React, { createContext, useContext, useState, useEffect } from 'react'
import { COLOR_MODES, ACCENT_COLORS, FONT_SIZES, DEFAULT_MODE, DEFAULT_ACCENT, DEFAULT_FONT } from './theme.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [mode,     setModeState]   = useState(() => localStorage.getItem('ph-mode')   || DEFAULT_MODE)
  const [accent,   setAccentState] = useState(() => localStorage.getItem('ph-accent') || DEFAULT_ACCENT)
  const [fontSize, setFontState]   = useState(() => localStorage.getItem('ph-font')   || DEFAULT_FONT)

  const accentInfo = ACCENT_COLORS.find(a => a.id === accent) || ACCENT_COLORS[0]
  const fontInfo   = FONT_SIZES.find(f => f.id === fontSize)  || FONT_SIZES[2]

  // Inject CSS variables onto :root whenever any setting changes
  useEffect(() => {
    const root   = document.documentElement
    const colors = {
      ...COLOR_MODES[mode] || COLOR_MODES.dark,
      '--ac':  accentInfo.color,
      '--ac2': accentInfo.soft,
    }
    Object.entries(colors).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', mode)
  }, [mode, accentInfo])

  const setMode = (m) => { setModeState(m);   localStorage.setItem('ph-mode',   m) }
  const setAccent = (a) => { setAccentState(a); localStorage.setItem('ph-accent', a) }
  const setFontSize = (f) => { setFontState(f); localStorage.setItem('ph-font',   f) }

  return (
    <ThemeContext.Provider value={{
      mode, setMode,
      accent, setAccent, accentInfo,
      fontSize, setFontSize, fontScale: fontInfo.scale,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
