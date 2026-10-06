import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron';
import { IPC, type FileToWrite, type GodotProjectInfo, type OpenFileOptions, type SaveFileOptions } from '../shared/api';
import { MCP_DEFAULT_PORT, MCP_IPC } from '../shared/mcp';
import { startMcpServer, type McpServerHandle } from './mcpServer';

const APP_NAME = 'EasyPixel';
const dirtyWindows = new WeakSet<BrowserWindow>();
let mainWindow: BrowserWindow | null = null;
let mcp: McpServerHandle | null = null;

/**
 * Copies the bundled stdio bridge to the user data folder: a path that stays
 * valid across launches (an AppImage or asar path does not), for Claude Desktop.
 */
async function installBridge(): Promise<string> {
  const source = join(__dirname, '../bridge/mcp-bridge.js');
  const target = join(app.getPath('userData'), 'mcp-bridge.js');
  const code = await readFile(source, 'utf8');
  const current = await readFile(target, 'utf8').catch(() => '');
  if (current !== code) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, code);
  }
  return target;
}

async function startMcp(): Promise<void> {
  const port = Number(process.env.EASYPIXEL_MCP_PORT) || MCP_DEFAULT_PORT;
  const bridgePath = await installBridge().catch(() => join(__dirname, '../bridge/mcp-bridge.js'));
  mcp = startMcpServer({
    port,
    getWindow: () => mainWindow,
    // Claude Desktop launches this command; the EasyPixel/Electron binary doubles as Node.
    // In an AppImage, execPath points into a temporary mount: use the AppImage file itself.
    bridge: {
      command: process.env.APPIMAGE ?? process.execPath,
      // AppImage's AppRun prepends --no-sandbox (which Node would reject) unless it already sees it;
      // placed after the script it is just an ignored script argument.
      args: process.env.APPIMAGE ? [bridgePath, '--no-sandbox'] : [bridgePath],
      env: { ELECTRON_RUN_AS_NODE: '1', ...(port !== MCP_DEFAULT_PORT ? { EASYPIXEL_MCP_URL: `http://127.0.0.1:${port}/mcp` } : {}) },
    },
    onStatus: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(MCP_IPC.status, status);
    },
  });
}

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

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
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
  // Null until the server starts; the renderer also receives later updates via MCP_IPC.status.
  ipcMain.handle(MCP_IPC.info, () => mcp?.status ?? null);

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

  ipcMain.handle(IPC.pickDirectory, async (event, title?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, { title, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.godotProject, (_event, dir: string) => findGodotProject(dir));

  ipcMain.handle(IPC.writeFiles, async (_event, dir: string, files: FileToWrite[]) => {
    if (!isAbsolute(dir)) throw new Error(`Folder must be an absolute path: ${dir}`);
    await mkdir(dir, { recursive: true });
    const written: string[] = [];
    for (const file of files) {
      if (!file.name || file.name !== basename(file.name) || file.name.startsWith('.')) {
        throw new Error(`Invalid file name: ${file.name}`);
      }
      const path = join(dir, file.name);
      await writeFile(path, file.data);
      written.push(path);
    }
    return written;
  });

  ipcMain.handle(IPC.fetchLospec, async (_event, url: string) => {
    // Only Lospec palette JSON: the renderer cannot use this to reach arbitrary hosts.
    if (!/^https:\/\/lospec\.com\/palette-list\/[a-z0-9-]+\.json$/.test(url)) throw new Error(`Not a Lospec palette URL: ${url}`);
    const res = await net.fetch(url);
    if (!res.ok) throw new Error(res.status === 404 ? 'Palette not found on Lospec' : `Lospec answered ${res.status}`);
    return res.text();
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

/** Walks up from `dir` looking for project.godot (the folder may not exist yet). */
async function findGodotProject(dir: string): Promise<GodotProjectInfo | null> {
  if (!isAbsolute(dir)) return null;
  const target = resolve(dir);
  let current = target;
  for (;;) {
    try {
      await access(join(current, 'project.godot'));
      const rel = relative(current, target).split(sep).join('/');
      return { root: current, resDir: rel ? `res://${rel}` : 'res://' };
    } catch {
      const parent = dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

app.whenReady().then(() => {
  registerIpc();
  mainWindow = createWindow();
  void startMcp();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('will-quit', () => mcp?.close());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
