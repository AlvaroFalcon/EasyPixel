/** Contract between the Electron preload script and the renderer (window.easypixel). */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenedFile {
  path: string;
  name: string;
  /** Text content for text files, raw bytes otherwise. */
  data: string | Uint8Array;
}

export interface OpenFileOptions {
  title?: string;
  filters?: FileFilter[];
  /** Read the file as UTF-8 text (default) or as bytes. */
  binary?: boolean;
}

export interface SaveFileOptions {
  title?: string;
  /** Write straight to this path without a dialog. */
  path?: string;
  defaultName?: string;
  filters?: FileFilter[];
  data: string | Uint8Array;
}

import type { McpCall, McpStatus, McpToolResult } from './mcpTypes';

export interface EasyPixelMcpApi {
  getStatus(): Promise<McpStatus>;
  onStatus(cb: (status: McpStatus) => void): () => void;
  /** Registers the executor for tool calls coming from MCP clients. */
  onCall(cb: (call: McpCall) => void): () => void;
  sendResult(id: number, result: McpToolResult): void;
}

export interface GodotProjectInfo {
  /** Folder containing project.godot. */
  root: string;
  /** The chosen folder as a Godot path, e.g. "res://sprites/knight". */
  resDir: string;
}

export interface FileToWrite {
  /** Plain file name (no folders). */
  name: string;
  data: string | Uint8Array;
}

export interface EasyPixelApi {
  mcp: EasyPixelMcpApi;
  pickDirectory(title?: string): Promise<string | null>;
  /** Finds the Godot project containing `dir` (walking up to project.godot), or null. */
  godotProject(dir: string): Promise<GodotProjectInfo | null>;
  /** Writes files into `dir` (created if needed). Resolves to the absolute paths written. */
  writeFiles(dir: string, files: FileToWrite[]): Promise<string[]>;
  platform: string;
  openFile(options: OpenFileOptions): Promise<OpenedFile | null>;
  /** Resolves to the path written, or null when the dialog was cancelled. */
  saveFile(options: SaveFileOptions): Promise<string | null>;
  setWindowState(state: { title: string; dirty: boolean }): void;
}

export const IPC = {
  openFile: 'easypixel:open-file',
  saveFile: 'easypixel:save-file',
  setWindowState: 'easypixel:set-window-state',
  pickDirectory: 'easypixel:pick-directory',
  godotProject: 'easypixel:godot-project',
  writeFiles: 'easypixel:write-files',
} as const;
