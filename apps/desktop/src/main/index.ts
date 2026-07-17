import { app, BrowserWindow, session, shell } from 'electron';
import { join } from 'node:path';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Any window.open()/target=_blank click goes to the OS browser, never a
  // second Electron window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Dev: electron-vite's dev server sets ELECTRON_RENDERER_URL and HMRs the
  // renderer. Prod: load the built HTML straight off disk.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Electron auto-approves ALL permission requests (camera, mic, MIDI,
  // clipboard, notifications, ...) unless a handler is installed here — the
  // opposite of a browser's per-permission prompt UI. This app only needs
  // Web MIDI, so pin an explicit allowlist instead of relying on that
  // insecure default-allow-everything behavior.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'midi' || permission === 'midiSysex');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'midi' || permission === 'midiSysex';
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
