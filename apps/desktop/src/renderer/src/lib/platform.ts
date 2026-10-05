import type { OpenedFile, OpenFileOptions, SaveFileOptions } from '../../../shared/api';

/**
 * File access that works both inside Electron (native dialogs, real paths)
 * and in a plain browser (file input / download), so the UI can be developed
 * and tested with `npm run dev:web`.
 */
export const isElectron = typeof window !== 'undefined' && !!window.easypixel;

export async function openFile(options: OpenFileOptions): Promise<OpenedFile | null> {
  if (window.easypixel) return window.easypixel.openFile(options);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (options.filters ?? []).flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const data = options.binary ? new Uint8Array(await file.arrayBuffer()) : await file.text();
      resolve({ path: file.name, name: file.name, data });
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function saveFile(options: SaveFileOptions): Promise<string | null> {
  if (window.easypixel) return window.easypixel.saveFile(options);
  const name = options.path ?? options.defaultName ?? 'download';
  const blob = new Blob([options.data as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.split(/[\\/]/).pop() ?? name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export function setWindowState(title: string, dirty: boolean): void {
  if (window.easypixel) window.easypixel.setWindowState({ title, dirty });
  else document.title = `${dirty ? '• ' : ''}${title} — EasyPixel`;
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
