import {
  documentFromJson,
  documentToGif,
  documentToJson,
  FILE_EXTENSION,
  layoutSpritesheet,
  renderSpritesheet,
  scaleRegion,
  serializeHexPalette,
  type PixelRegion,
  type SpriteDocument,
} from '@easypixel/core';
import { create } from 'zustand';
import { exportToGodot } from '../lib/godot';
import { decodeImage, encodePng } from '../lib/image';
import { fileNameOf, isElectron, openFile, saveFile } from '../lib/platform';
import { fmt, t } from '../strings';
import type { GodotExportSettings } from '@easypixel/core';
import { activateTab, allTabs, isTabDirty, markSaved, notify, openDocument, settleFloating, useEditor, type DocTab } from './editor';

export type DialogState =
  | { kind: 'new' }
  | { kind: 'resize' }
  | { kind: 'import'; image: PixelRegion; fileName: string }
  | { kind: 'export' }
  /** Create (no tagId) or edit an animation tag. */
  | { kind: 'tag'; tagId?: string }
  | { kind: 'mcp' }
  | { kind: 'godot' }
  | { kind: 'palette-save' }
  | { kind: 'lospec' }
  | null;

export const useDialog = create<{ dialog: DialogState }>(() => ({ dialog: null }));

export function openDialog(dialog: DialogState): void {
  settleFloating();
  useDialog.setState({ dialog });
}

export function closeDialog(): void {
  useDialog.setState({ dialog: null });
}

const SPRITE_FILTERS = [{ name: 'EasyPixel', extensions: ['epx.json', 'json'] }];
const PNG_FILTERS = [{ name: 'PNG', extensions: ['png'] }];

/** Asks before throwing away the unsaved work of a tab. */
export function confirmDiscard(tab: Pick<DocTab, 'history' | 'savedDoc'>): boolean {
  return !isTabDirty(tab) || window.confirm(t.dialogs.discardChanges);
}

export function newDocument(doc: SpriteDocument): void {
  openDocument(doc, null);
}

export async function openSprite(): Promise<void> {
  try {
    const file = await openFile({ title: t.menu.open, filters: SPRITE_FILTERS });
    if (!file) return;
    const path = isElectron ? file.path : null;
    const already = path && allTabs().find((tab) => tab.filePath === path);
    if (already) {
      activateTab(already.id);
      return;
    }
    const doc = documentFromJson(file.data as string);
    openDocument(doc, path);
    notify(fmt(t.status.opened, { name: file.name }));
  } catch (e) {
    notify((e as Error).message, 'error');
  }
}

export async function saveSprite(saveAs = false): Promise<void> {
  settleFloating();
  const s = useEditor.getState();
  const doc = s.history.present.doc;
  try {
    const path = await saveFile({
      title: saveAs ? t.menu.saveAs : t.menu.save,
      path: !saveAs && s.filePath ? s.filePath : undefined,
      defaultName: `${doc.name}${FILE_EXTENSION}`,
      filters: SPRITE_FILTERS,
      data: documentToJson(doc),
    });
    if (!path) return;
    markSaved(path);
    notify(fmt(t.status.saved, { path }));
  } catch (e) {
    notify((e as Error).message, 'error');
  }
}

export async function importPng(): Promise<void> {
  try {
    const file = await openFile({ title: t.menu.importPng, filters: PNG_FILTERS, binary: true });
    if (!file) return;
    const image = await decodeImage(file.data as Uint8Array);
    openDialog({ kind: 'import', image, fileName: file.name });
  } catch (e) {
    notify((e as Error).message, 'error');
  }
}

export interface ExportOptions {
  mode: 'frame' | 'sheet' | 'gif';
  /** For GIFs: animation to play (null = all frames). */
  tagId?: string | null;
  columns: number;
  spacing: number;
  scale: number;
}

export function exportImage(doc: SpriteDocument, frameIndex: number, opts: ExportOptions): PixelRegion {
  const tag = opts.mode === 'gif' ? doc.tags.find((x) => x.id === opts.tagId) : undefined;
  const single = opts.mode === 'frame' ? frameIndex : opts.mode === 'gif' ? (tag?.from ?? 0) : null;
  const layout = layoutSpritesheet(doc, {
    frames: single !== null ? [single] : undefined,
    columns: opts.columns,
    spacing: opts.spacing,
  });
  return scaleRegion(renderSpritesheet(doc, layout), opts.scale);
}

export async function exportPng(opts: ExportOptions): Promise<void> {
  settleFloating();
  const { history, frameIndex } = useEditor.getState();
  const doc = history.present.doc;
  try {
    let path: string | null;
    if (opts.mode === 'gif') {
      const tag = doc.tags.find((x) => x.id === opts.tagId) ?? null;
      path = await saveFile({
        title: t.menu.exportPng,
        defaultName: `${doc.name}${tag ? `_${tag.name}` : ''}.gif`,
        filters: [{ name: 'GIF', extensions: ['gif'] }],
        data: documentToGif(doc, tag, opts.scale),
      });
    } else {
      const bytes = await encodePng(exportImage(doc, frameIndex, opts));
      const suffix = opts.mode === 'frame' ? `_${frameIndex + 1}` : '_sheet';
      path = await saveFile({
        title: t.menu.exportPng,
        defaultName: `${doc.name}${suffix}.png`,
        filters: PNG_FILTERS,
        data: bytes,
      });
    }
    if (path) notify(fmt(t.status.exported, { path }));
  } catch (e) {
    notify((e as Error).message, 'error');
  }
}

export async function exportPalette(): Promise<void> {
  const doc = useEditor.getState().doc;
  const path = await saveFile({
    title: t.palette.exportFile,
    defaultName: `${doc.name}.hex`,
    filters: [{ name: 'Lospec HEX', extensions: ['hex'] }],
    data: serializeHexPalette(doc.palette),
  });
  if (path) notify(fmt(t.status.exported, { path: fileNameOf(path) }));
}

/** Exports with the given settings and reports the result as a notice. */
export async function runGodotExport(settings: GodotExportSettings): Promise<boolean> {
  settleFloating();
  try {
    const result = await exportToGodot(useEditor.getState().history.present.doc, settings);
    notify(
      result.tiles !== undefined
        ? fmt(t.godot.exportedTiles, { res: result.resDir, n: result.tiles })
        : fmt(t.godot.exported, { res: result.resDir, n: result.written.length }),
    );
    return true;
  } catch (e) {
    notify((e as Error).message, 'error');
    return false;
  }
}

/** Re-exports with the settings saved in the sprite, or opens the dialog the first time. */
export function quickGodotExport(): void {
  const settings = useEditor.getState().history.present.doc.godot;
  if (settings && isElectron) void runGodotExport(settings);
  else openDialog({ kind: 'godot' });
}
