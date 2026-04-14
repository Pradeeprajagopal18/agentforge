const { contextBridge, ipcRenderer } = require('electron')

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Update lifecycle
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
  installUpdate:      ()   => ipcRenderer.send('install-update'),

  // Menu/tray → renderer commands
  onNewConversation:   (cb) => ipcRenderer.on('new-conversation',   () => cb()),
  onOpenSettings:      (cb) => ipcRenderer.on('open-settings',      () => cb()),
  onOpenShortcuts:     (cb) => ipcRenderer.on('open-shortcuts',     () => cb()),
  onExportConversation:(cb) => ipcRenderer.on('export-conversation',() => cb()),

  // Cleanup listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
})
