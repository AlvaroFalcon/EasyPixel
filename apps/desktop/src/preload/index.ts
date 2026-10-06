import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type EasyPixelApi } from '../shared/api';
import { MCP_IPC, type McpCall, type McpStatus } from '../shared/mcpTypes';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: EasyPixelApi = {
  platform: process.platform,
  openFile: (options) => ipcRenderer.invoke(IPC.openFile, options),
  saveFile: (options) => ipcRenderer.invoke(IPC.saveFile, options),
  setWindowState: (state) => ipcRenderer.send(IPC.setWindowState, state),
  mcp: {
    getStatus: () => ipcRenderer.invoke(MCP_IPC.info),
    onStatus: (cb) => subscribe<McpStatus>(MCP_IPC.status, cb),
    onCall: (cb) => subscribe<McpCall>(MCP_IPC.call, cb),
    sendResult: (id, result) => ipcRenderer.send(MCP_IPC.result, { id, result }),
  },
};

contextBridge.exposeInMainWorld('easypixel', api);
