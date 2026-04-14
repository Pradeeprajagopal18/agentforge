const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const log             = require('electron-log')
const path            = require('path')
const { spawn }       = require('child_process')
const http            = require('http')

// ── Logging ──────────────────────────────────────────────────────
log.transports.file.level = 'info'
autoUpdater.logger = log

const isDev = process.env.NODE_ENV === 'development'

// ── State ────────────────────────────────────────────────────────
let mainWindow   = null
let tray         = null
let backendProc  = null
let backendReady = false

const BACKEND_PORT  = parseInt(process.env.BACKEND_PORT  || "9000", 10)
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || "5173", 10)
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist', 'index.html')
const BACKEND_DIR   = isDev
  ? path.join(__dirname, '..', 'backend')
  : path.join(process.resourcesPath, 'backend')


// ── Backend lifecycle ─────────────────────────────────────────────

function startBackend() {
  return new Promise((resolve, reject) => {
    const python = process.platform === 'win32' ? 'python' : 'python3'
    backendProc = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
      cwd: BACKEND_DIR,
      env: { ...process.env, BACKEND_PORT: String(BACKEND_PORT), FRONTEND_PORT: String(FRONTEND_PORT) },
    })

    backendProc.stdout.on('data', d => {
      const msg = d.toString()
      log.info('[backend]', msg.trim())
      if (msg.includes('Application startup complete') || msg.includes('Uvicorn running')) {
        backendReady = true
        resolve()
      }
    })

    backendProc.stderr.on('data', d => {
      const msg = d.toString()
      log.info('[backend-stderr]', msg.trim())
      // uvicorn logs to stderr
      if (msg.includes('Application startup complete') || msg.includes('Uvicorn running')) {
        backendReady = true
        resolve()
      }
    })

    backendProc.on('error', reject)

    // Timeout fallback — try hitting health endpoint
    setTimeout(() => {
      pollBackend(resolve, reject, 20)
    }, 2000)
  })
}

function pollBackend(resolve, reject, retries) {
  if (backendReady) return
  if (retries <= 0) { reject(new Error('Backend failed to start')); return }
  http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, res => {
    if (res.statusCode === 200) { backendReady = true; resolve() }
    else setTimeout(() => pollBackend(resolve, reject, retries - 1), 500)
  }).on('error', () => {
    setTimeout(() => pollBackend(resolve, reject, retries - 1), 500)
  })
}

function stopBackend() {
  if (backendProc) {
    backendProc.kill()
    backendProc = null
  }
}


// ── Main window ───────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#080810',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    show: false,
  })

  const url = isDev
    ? `http://localhost:${FRONTEND_PORT}`
    : `file://${FRONTEND_DIST}`

  mainWindow.loadURL(url)

  // Inject runtime config into the renderer so config.js can read it
  // This lets the same Vite build work at any port
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__AGENTFORGE_CONFIG__ = {
        BACKEND_HOST: 'localhost',
        BACKEND_PORT: '${BACKEND_PORT}',
      };
    `)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    // On macOS: hide to tray instead of closing
    if (process.platform === 'darwin' && !app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}


// ── System tray ───────────────────────────────────────────────────

function createTray() {
  // Use a template icon on macOS, regular icon elsewhere
  const iconPath = process.platform === 'darwin'
    ? path.join(__dirname, 'assets', 'tray-icon-Template.png')
    : path.join(__dirname, 'assets', 'tray-icon.png')

  // Fallback: create a simple colored icon if asset missing
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('AgentForge')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open AgentForge',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus() }
        else createWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'New Conversation',
      accelerator: 'CmdOrCtrl+K',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('new-conversation')
      }
    },
    {
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('open-settings')
      }
    },
    { type: 'separator' },
    {
      label: `Backend: ${backendReady ? '● Running' : '○ Starting'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdatesAndNotify()
    },
    { type: 'separator' },
    {
      label: 'Quit AgentForge',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.focus()
    else { mainWindow?.show(); mainWindow?.focus() }
  })

  tray.on('double-click', () => {
    mainWindow?.show(); mainWindow?.focus()
  })
}


// ── App menu (macOS) ──────────────────────────────────────────────

function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { label: 'About AgentForge', role: 'about' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('open-settings') },
        { type: 'separator' },
        { label: 'Hide AgentForge', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { app.isQuitting = true; app.quit() } }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Conversation', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.webContents.send('new-conversation') },
        { label: 'Export Conversation', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('export-conversation') },
        { type: 'separator' },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle DevTools', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', role: 'resetZoom' },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: () => mainWindow?.webContents.send('open-shortcuts') },
        { type: 'separator' },
        { label: 'Claude Code Docs', click: () => shell.openExternal('https://docs.anthropic.com/en/docs/claude-code/overview') },
        { label: 'Report Issue', click: () => shell.openExternal('https://github.com/your-org/claude-local/issues') }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}


// ── Auto updater ──────────────────────────────────────────────────

function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify()

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    mainWindow?.webContents.send('update-available', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    mainWindow?.webContents.send('update-downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    log.error('AutoUpdater error:', err)
  })
}


// ── IPC handlers ──────────────────────────────────────────────────

ipcMain.on('install-update', () => {
  app.isQuitting = true
  autoUpdater.quitAndInstall()
})

ipcMain.handle('get-version', () => app.getVersion())


// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(async () => {
  createAppMenu()
  createTray()

  try {
    log.info('Starting Python backend...')
    await startBackend()
    log.info('Backend ready')
  } catch (err) {
    log.error('Backend failed to start:', err)
  }

  createWindow()

  if (!isDev) {
    // Check for updates 5s after launch to avoid blocking startup
    setTimeout(setupAutoUpdater, 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend()
    app.quit()
  }
})
