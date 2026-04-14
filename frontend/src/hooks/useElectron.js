import { useEffect, useState, useCallback } from 'react'

/**
 * useElectron — detects whether the app is running inside Electron
 * and exposes the IPC bridge (window.electronAPI) as a hook.
 *
 * Returns:
 *   isElectron      — boolean
 *   version         — app version string or null
 *   updateInfo      — { version, ... } when update-available fires
 *   updateDownloaded— true once update is fully downloaded
 *   installUpdate   — fn to quit-and-install
 *   dismissUpdate   — fn to clear the banner
 *
 * Also accepts callbacks for tray/menu → renderer commands:
 *   onNewConversation, onOpenSettings, onOpenShortcuts, onExportConversation
 */
export function useElectron({
  onNewConversation,
  onOpenSettings,
  onOpenShortcuts,
  onExportConversation,
} = {}) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  const [version,         setVersion]         = useState(null)
  const [updateInfo,      setUpdateInfo]       = useState(null)
  const [updateDownloaded,setUpdateDownloaded] = useState(false)
  const [dismissed,       setDismissed]        = useState(false)

  useEffect(() => {
    if (!isElectron) return
    const api = window.electronAPI

    // Version
    api.getVersion().then(setVersion).catch(() => {})

    // Update events
    api.onUpdateAvailable((info) => {
      setUpdateInfo(info)
      setUpdateDownloaded(false)
      setDismissed(false)
    })
    api.onUpdateDownloaded((info) => {
      setUpdateInfo(info)
      setUpdateDownloaded(true)
      setDismissed(false)
    })

    // Menu / tray → renderer
    if (onNewConversation)    api.onNewConversation(onNewConversation)
    if (onOpenSettings)       api.onOpenSettings(onOpenSettings)
    if (onOpenShortcuts)      api.onOpenShortcuts(onOpenShortcuts)
    if (onExportConversation) api.onExportConversation(onExportConversation)

    return () => {
      // Clean up IPC listeners on unmount
      ;['update-available','update-downloaded','new-conversation',
        'open-settings','open-shortcuts','export-conversation'
      ].forEach(ch => api.removeAllListeners?.(ch))
    }
  }, [isElectron])

  const installUpdate = useCallback(() => {
    window.electronAPI?.installUpdate()
  }, [])

  const dismissUpdate = useCallback(() => {
    setDismissed(true)
  }, [])

  return {
    isElectron,
    version,
    updateInfo:       dismissed ? null : updateInfo,
    updateDownloaded,
    installUpdate,
    dismissUpdate,
  }
}
