import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC, type OpenFileOptions, type SaveFileOptions } from '../shared/api';

const APP_NAME = 'EasyPixel';
const dirtyWindows = new WeakSet<BrowserWindow>();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#1b1c22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (event) => {
    if (!dirtyWindows.has(win)) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Salir sin guardar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: APP_NAME,
      message: 'Hay cambios sin guardar.',
      detail: '¿Seguro que quieres cerrar? Se perderán los cambios.',
    });
    if (choice === 1) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle(IPC.openFile, async (event, options: OpenFileOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: options.title,
      filters: options.filters,
      properties: ['openFile'],
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const data = options.binary ? new Uint8Array(await readFile(path)) : await readFile(path, 'utf8');
    return { path, name: basename(path), data };
  });

  ipcMain.handle(IPC.saveFile, async (event, options: SaveFileOptions) => {
    let path = options.path;
    if (!path) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win!, {
        title: options.title,
        defaultPath: options.defaultName,
        filters: options.filters,
      });
      if (result.canceled || !result.filePath) return null;
      path = result.filePath;
    }
    await writeFile(path, options.data);
    return path;
  });

  ipcMain.on(IPC.setWindowState, (event, state: { title: string; dirty: boolean }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (state.dirty) dirtyWindows.add(win);
    else dirtyWindows.delete(win);
    win.setTitle(`${state.dirty ? '• ' : ''}${state.title} — ${APP_NAME}`);
    win.setDocumentEdited(state.dirty);
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
