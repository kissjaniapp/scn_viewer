'use strict';

const { app, BrowserWindow, dialog, Menu, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createLocalServer } = require('./server.cjs');

let mainWindow;
let httpServer;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.setAppUserModelId('hu.kissjaniapp.scnviewer');
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function log(message) {
  try {
    const file = path.join(app.getPath('userData'), 'startup.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {}
}

async function start() {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  const viewerDir = path.resolve(__dirname, '..', 'dist', 'viewer');
  const { server, url } = await createLocalServer({ viewerDir });
  httpServer = server;
  log('SCN Viewer helyi 3D motor indult: ' + url);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    center: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111a27',
    icon: path.resolve(__dirname, '..', 'installer', 'SCNViewer.ico'),
    title: 'SCN Viewer',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.maximize(); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== url) event.preventDefault();
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('3D renderfolyamat leállt: ' + details.reason);
    dialog.showErrorBox('SCN Viewer hiba', 'A 3D megjelenítés megszakadt. Indítsd újra az alkalmazást.\nA részleteket a startup.log fájl tartalmazza.');
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(url);
}

if (singleInstance) {
  app.whenReady().then(start).catch(error => {
    log(error.stack || String(error));
    dialog.showErrorBox('SCN Viewer – indítási hiba', `Az alkalmazás nem indult el:\n${error.message}\n\nNapló: ${path.join(app.getPath('userData'), 'startup.log')}`);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (httpServer) { httpServer.close(); httpServer = null; } });
}
