import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type EasyPixelApi } from '../shared/api';

const api: EasyPixelApi = {
  platform: process.platform,
  openFile: (options) => ipcRenderer.invoke(IPC.openFile, options),
  saveFile: (options) => ipcRenderer.invoke(IPC.saveFile, options),
  setWindowState: (state) => ipcRenderer.send(IPC.setWindowState, state),
};

contextBridge.exposeInMainWorld('easypixel', api);
