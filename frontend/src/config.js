/**
 * config.js — single source of truth for AgentForge frontend.
 *
 * In development Vite reads VITE_* vars from frontend/.env (or .env.local).
 * In production (Electron) the Electron main process sets window.__AGENTFORGE_CONFIG__
 * before loading the page so the same build works at any port.
 *
 * Priority:  window.__AGENTFORGE_CONFIG__  >  VITE_ env vars  >  defaults
 */

const electronCfg =
  typeof window !== 'undefined' && window.__AGENTFORGE_CONFIG__
    ? window.__AGENTFORGE_CONFIG__
    : null

function cfg(key, viteFallback, hardDefault) {
  if (electronCfg?.[key] !== undefined) return electronCfg[key]
  const viteVal = import.meta.env?.[`VITE_${key}`]
  return viteVal !== undefined ? viteVal : hardDefault
}

export const APP_NAME    = 'AgentForge'
export const APP_TAGLINE = 'Powered by Claude Code · All features local'
export const APP_ICON    = '⬡'

const BACKEND_HOST = cfg('BACKEND_HOST', undefined, 'localhost')
const BACKEND_PORT = cfg('BACKEND_PORT', undefined, '9000')

export const API    = `http://${BACKEND_HOST}:${BACKEND_PORT}`
export const WS_BASE = `ws://${BACKEND_HOST}:${BACKEND_PORT}`

// Storage keys namespaced to the app
export const STORAGE_PINS_KEY = 'agentforge:pinned'
