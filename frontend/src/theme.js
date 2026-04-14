/**
 * theme.js — AgentForge appearance system
 * Defines dark/light palettes, accent colors, and font-size options.
 * Colors are applied as CSS custom properties on :root by ThemeContext.
 */

export const COLOR_MODES = {
  dark: {
    '--bg':   '#080810',
    '--bg1':  '#0a0a12',
    '--bg2':  '#0d0d1a',
    '--bg3':  '#111120',
    '--bg4':  '#13132a',
    '--bg5':  '#1a1a2e',
    '--bd':   '#1e1e2e',
    '--bd2':  '#2a2a3e',
    '--bd3':  '#2a2a4a',
    '--tx':   '#e0e0e0',
    '--tx2':  '#bbbbbb',
    '--tx3':  '#888888',
    '--tx4':  '#555555',
    '--tx5':  '#333333',
  },
  light: {
    '--bg':   '#f0f0fa',
    '--bg1':  '#e8e8f5',
    '--bg2':  '#ffffff',
    '--bg3':  '#f5f5ff',
    '--bg4':  '#e4e4f8',
    '--bg5':  '#d8d8ee',
    '--bd':   '#d0d0e4',
    '--bd2':  '#b8b8d0',
    '--bd3':  '#a8a8c8',
    '--tx':   '#1a1a2e',
    '--tx2':  '#3a3a5c',
    '--tx3':  '#666688',
    '--tx4':  '#9090b0',
    '--tx5':  '#b0b0cc',
  },
}

export const ACCENT_COLORS = [
  { id: 'purple', color: '#7c6af7', soft: '#a78bfa', name: 'Purple' },
  { id: 'blue',   color: '#3b82f6', soft: '#60a5fa', name: 'Blue'   },
  { id: 'green',  color: '#10b981', soft: '#34d399', name: 'Green'  },
  { id: 'amber',  color: '#f59e0b', soft: '#fbbf24', name: 'Amber'  },
  { id: 'pink',   color: '#ec4899', soft: '#f472b6', name: 'Pink'   },
  { id: 'red',    color: '#ef4444', soft: '#f87171', name: 'Red'    },
]

export const FONT_SIZES = [
  { id: 'xs', label: 'XS', scale: 0.8  },
  { id: 'sm', label: 'S',  scale: 0.9  },
  { id: 'md', label: 'M',  scale: 1.0  },
  { id: 'lg', label: 'L',  scale: 1.12 },
  { id: 'xl', label: 'XL', scale: 1.25 },
]

export const DEFAULT_MODE    = 'dark'
export const DEFAULT_ACCENT  = 'purple'
export const DEFAULT_FONT    = 'md'
