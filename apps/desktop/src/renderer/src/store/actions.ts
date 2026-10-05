import {
  documentFromJson,
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
import { decodeImage, encodePng } from '../lib/image';
import { fileNameOf, isElectron, openFile, saveFile } from '../lib/platform';
import { fmt, t } from '../strings';
import { isDirty, loadDocument, markSaved, notify, settleFloating, useEditor } from './editor';

export type DialogState =
  | { kind: 'new' }
  | { kind: 'resize' }
  | { kind: 'import'; image: PixelRegion; fileName: string }
  | { kind: 'export' }
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

/** Asks before throwing away unsaved work. */
export function confirmDiscard(): boolean {
  return !isDirty(useEditor.getState()) || window.confirm(t.dialogs.discardChanges);
}

export function newDocument(doc: SpriteDocument): void {
  loadDocument(doc, null);
}

export async function openSprite(): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const file = await openFile({ title: t.menu.open, filters: SPRITE_FILTERS });
    if (!file) return;
    const doc = documentFromJson(file.data as string);
    loadDocument(doc, isElectron ? file.path : null);
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
  mode: 'frame' | 'sheet';
  columns: number;
  spacing: number;
  scale: number;
}

export function exportImage(doc: SpriteDocument, frameIndex: number, opts: ExportOptions): PixelRegion {
  const layout = layoutSpritesheet(doc, {
    frames: opts.mode === 'frame' ? [frameIndex] : undefined,
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
    const bytes = await encodePng(exportImage(doc, frameIndex, opts));
    const suffix = opts.mode === 'frame' ? `_${frameIndex + 1}` : '_sheet';
    const path = await saveFile({
      title: t.menu.exportPng,
      defaultName: `${doc.name}${suffix}.png`,
      filters: PNG_FILTERS,
      data: bytes,
    });
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
