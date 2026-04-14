import { WS_BASE } from '../config.js'
import { useRef, useCallback, useEffect } from 'react'

const WS_URL = (convId) => `${WS_BASE}/ws/${convId}`

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000]  // exponential backoff ms
const HEARTBEAT_INTERVAL = 25000  // 25s ping to keep connection alive
const MAX_RETRIES = 5

/**
 * useWebSocket — manages a single WebSocket connection with:
 *  - Auto-reconnect on unexpected close (exponential backoff)
 *  - Heartbeat pings to prevent idle timeout
 *  - Queued messages that replay after reconnect
 *  - Clean teardown on unmount / convId change
 *
 * Returns: { send, close, isConnected, isReconnecting }
 */
export function useWebSocket(convId, { onMessage, onConnect, onDisconnect, onError } = {}) {
  const wsRef          = useRef(null)
  const retryCount     = useRef(0)
  const retryTimer     = useRef(null)
  const heartbeatTimer = useRef(null)
  const pendingQueue   = useRef([])
  const isConnected    = useRef(false)
  const intentionalClose = useRef(false)

  const clearTimers = () => {
    clearTimeout(retryTimer.current)
    clearInterval(heartbeatTimer.current)
  }

  const startHeartbeat = (ws) => {
    clearInterval(heartbeatTimer.current)
    heartbeatTimer.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        // Send a ping that the backend will ignore (type unknown → skip)
        try { ws.send(JSON.stringify({ type: '__ping__' })) } catch {}
      }
    }, HEARTBEAT_INTERVAL)
  }

  const connect = useCallback(() => {
    if (!convId) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL(convId))
    wsRef.current = ws

    ws.onopen = () => {
      isConnected.current = true
      retryCount.current  = 0
      startHeartbeat(ws)
      onConnect?.()

      // Replay any queued messages
      while (pendingQueue.current.length > 0) {
        const msg = pendingQueue.current.shift()
        ws.send(msg)
      }
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === '__pong__') return  // ignore server pong
        onMessage?.(data)
      } catch {}
    }

    ws.onerror = (e) => {
      onError?.(e)
    }

    ws.onclose = (e) => {
      isConnected.current = false
      clearInterval(heartbeatTimer.current)

      if (intentionalClose.current) {
        onDisconnect?.()
        return
      }

      // Unexpected close — schedule reconnect
      if (retryCount.current < MAX_RETRIES) {
        const delay = RECONNECT_DELAYS[Math.min(retryCount.current, RECONNECT_DELAYS.length - 1)]
        retryCount.current++
        retryTimer.current = setTimeout(connect, delay)
      } else {
        onDisconnect?.()
      }
    }
  }, [convId, onMessage, onConnect, onDisconnect, onError])

  // Connect/reconnect when convId changes
  useEffect(() => {
    intentionalClose.current = false
    retryCount.current = 0
    pendingQueue.current = []
    connect()

    return () => {
      intentionalClose.current = true
      clearTimers()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [convId])

  const send = useCallback((data) => {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload)
    } else {
      // Queue for replay after reconnect
      pendingQueue.current.push(payload)
      connect()  // try to reconnect immediately
    }
  }, [connect])

  const close = useCallback(() => {
    intentionalClose.current = true
    clearTimers()
    wsRef.current?.close()
    wsRef.current = null
    isConnected.current = false
  }, [])

  return { send, close, isConnected }
}
