import {
  canRedo,
  canUndo,
  clampRect,
  clearCel,
  copyRegion,
  createDocument,
  createHistory,
  parseHex,
  pasteRegion,
  pushHistory,
  redo as historyRedo,
  undo as historyUndo,
  type Color,
  type EditSource,
  type History,
  type PixelRegion,
  type Point,
  type Rect,
  type SpriteDocument,
} from '@easypixel/core';
import { create } from 'zustand';
import { t } from '../strings';

export type ToolId = 'pencil' | 'eraser' | 'bucket' | 'line' | 'rect' | 'ellipse' | 'eyedropper' | 'select' | 'pan';

/** Pixels lifted from a cel (moved selection or paste) that float until committed. */
export interface Floating {
  region: PixelRegion;
  x: number;
  y: number;
  /** Document with the source area already cleared; the region is stamped on top of it. */
  base: SpriteDocument;
  label: string;
}

export interface Notice {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

/** Per-document state. The active tab's values live at the top level of EditorState. */
export interface DocTab {
  id: string;
  history: History;
  doc: SpriteDocument;
  savedDoc: SpriteDocument | null;
  filePath: string | null;
  layerId: string;
  frameIndex: number;
  activeTagId: string | null;
  frameRange: { from: number; to: number } | null;
  selection: Rect | null;
  zoom: number;
  pan: Point | null;
  /** Created by Claude through MCP (shown in the tab). */
  createdBy: EditSource;
}

export interface EditorState {
  /** Id of the active tab. */
  tabId: string;
  /** Every open document, in tab order. The active entry is refreshed when switching away. */
  tabs: DocTab[];
  createdBy: EditSource;

  history: History;
  /** Displayed document: history.present.doc plus any in-progress (uncommitted) edit. */
  doc: SpriteDocument;
  /** Document as it was last saved/opened, to detect unsaved changes. */
  savedDoc: SpriteDocument | null;
  filePath: string | null;

  layerId: string;
  frameIndex: number;

  tool: ToolId;
  primary: Color;
  secondary: Color;
  brushSize: number;
  pixelPerfect: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
  fillContiguous: boolean;
  shapeFilled: boolean;

  showGrid: boolean;
  onionSkin: boolean;
  /** Frames shown before/after the current one when onion skin is on. */
  onionRange: number;

  /** Animation preview is playing. */
  playing: boolean;
  /** Tag (animation) selected in the timeline and played by the preview; null = all frames. */
  activeTagId: string | null;
  /** Frames selected with shift+click in the timeline (inclusive). */
  frameRange: { from: number; to: number } | null;

  zoom: number;
  /** Screen offset of the sprite's top-left corner; null = fit on next render. */
  pan: Point | null;
  cursor: Point | null;

  selection: Rect | null;
  floating: Floating | null;
  clipboard: PixelRegion | null;

  notice: Notice | null;
  /** Last MCP tool Claude ran (for the activity indicator). */
  claudeActivity: { tool: string; at: number } | null;
}

const initialDoc = createDocument({ name: 'sprite', width: 32, height: 32 });
let tabCounter = 0;
const newTabId = () => `sprite_${++tabCounter}`;
const initialTabId = newTabId();

export const useEditor = create<EditorState>(() => ({
  tabId: initialTabId,
  tabs: [],
  createdBy: 'user',
  history: createHistory(initialDoc),
  doc: initialDoc,
  savedDoc: initialDoc,
  filePath: null,
  layerId: initialDoc.layers[0].id,
  frameIndex: 0,
  tool: 'pencil',
  primary: parseHex('#000000'),
  secondary: parseHex('#00000000'),
  brushSize: 1,
  pixelPerfect: true,
  mirrorX: false,
  mirrorY: false,
  fillContiguous: true,
  shapeFilled: false,
  showGrid: true,
  onionSkin: false,
  onionRange: 1,
  playing: false,
  activeTagId: null,
  frameRange: null,
  zoom: 8,
  pan: null,
  cursor: null,
  selection: null,
  floating: null,
  clipboard: null,
  notice: null,
  claudeActivity: null,
}));

const get = useEditor.getState;
const set = useEditor.setState;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const isDirty = (s: EditorState) => s.history.present.doc !== s.savedDoc;
export const currentFrame = (s: EditorState) => s.doc.frames[s.frameIndex];
export const currentLayer = (s: EditorState) => s.doc.layers.find((l) => l.id === s.layerId)!;
export const undoAvailable = (s: EditorState) => !!s.floating || canUndo(s.history);
export const redoAvailable = (s: EditorState) => canRedo(s.history);

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

let noticeId = 0;
export function notify(text: string, kind: Notice['kind'] = 'info'): void {
  set({ notice: { id: ++noticeId, text, kind } });
}

// ---------------------------------------------------------------------------
// Committing edits
// ---------------------------------------------------------------------------

/** Keeps the active layer / frame valid after the document changed shape. */
function normalized(doc: SpriteDocument, layerId: string, frameIndex: number) {
  const s = get();
  const layerOk = doc.layers.some((l) => l.id === layerId);
  const range = s.frameRange;
  return {
    layerId: layerOk ? layerId : doc.layers[doc.layers.length - 1].id,
    frameIndex: Math.max(0, Math.min(doc.frames.length - 1, frameIndex)),
    activeTagId: doc.tags.some((t) => t.id === s.activeTagId) ? s.activeTagId : null,
    frameRange: range && range.to < doc.frames.length ? range : null,
  };
}

function setPresent(history: History, extra: Partial<EditorState> = {}): void {
  const s = get();
  const doc = history.present.doc;
  set({
    history,
    doc,
    ...normalized(doc, extra.layerId ?? s.layerId, extra.frameIndex ?? s.frameIndex),
    ...withoutKeys(extra, ['layerId', 'frameIndex']),
  });
}

function withoutKeys<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Applies `fn` to the committed document and records it as one undo step.
 * Errors (e.g. drawing on a locked layer) are shown as a notice. Returns
 * whether the edit was applied.
 */
export function commit(
  fn: (doc: SpriteDocument) => SpriteDocument,
  label: string,
  opts: { source?: EditSource; select?: Partial<Pick<EditorState, 'layerId' | 'frameIndex'>> } = {},
): boolean {
  settleFloating();
  const s = get();
  try {
    const next = fn(s.history.present.doc);
    setPresent(pushHistory(s.history, next, label, opts.source), opts.select);
    return true;
  } catch (e) {
    notify((e as Error).message, 'error');
    set({ doc: s.history.present.doc });
    return false;
  }
}

/**
 * Like commit() but throws instead of showing a notice, and returns the new
 * document. Used by the MCP executor so errors go back to Claude.
 */
export function commitOrThrow(
  fn: (doc: SpriteDocument) => SpriteDocument,
  label: string,
  opts: { source?: EditSource; select?: Partial<Pick<EditorState, 'layerId' | 'frameIndex'>> } = {},
): SpriteDocument {
  settleFloating();
  const s = get();
  const next = fn(s.history.present.doc);
  setPresent(pushHistory(s.history, next, label, opts.source), opts.select);
  return next;
}

/** Shows an uncommitted document (live stroke / shape preview). */
export function preview(doc: SpriteDocument): void {
  set({ doc });
}

/** Records the previewed document as one undo step. */
export function commitPreview(label: string, source: EditSource = 'user'): void {
  const s = get();
  setPresent(pushHistory(s.history, s.doc, label, source));
}

export function cancelPreview(): void {
  set({ doc: get().history.present.doc });
}

export function undo(): void {
  if (get().floating) {
    cancelFloating();
    return;
  }
  setPresent(historyUndo(get().history), { selection: null });
}

export function redo(): void {
  settleFloating();
  setPresent(historyRedo(get().history), { selection: null });
}

// ---------------------------------------------------------------------------
// Tabs (open documents)
// ---------------------------------------------------------------------------

const TAB_KEYS = [
  'history', 'doc', 'savedDoc', 'filePath', 'layerId', 'frameIndex', 'activeTagId',
  'frameRange', 'selection', 'zoom', 'pan', 'createdBy',
] as const;

function snapshotActive(): DocTab {
  const s = get();
  const tab = { id: s.tabId } as DocTab;
  for (const k of TAB_KEYS) (tab as unknown as Record<string, unknown>)[k] = s[k];
  tab.doc = s.history.present.doc;
  return tab;
}

/** All tabs with the active one up to date (use for rendering the tab bar). */
export function allTabs(s: EditorState = get()): DocTab[] {
  const active = s.tabs.some((t) => t.id === s.tabId) ? s.tabs : [...s.tabs, { id: s.tabId } as DocTab];
  return active.map((t) =>
    t.id === s.tabId
      ? ({ ...t, history: s.history, doc: s.doc, savedDoc: s.savedDoc, filePath: s.filePath, createdBy: s.createdBy } as DocTab)
      : t,
  );
}

export const isTabDirty = (t: Pick<DocTab, 'history' | 'savedDoc'>) => t.history.present.doc !== t.savedDoc;
export const anyDirty = (s: EditorState) => allTabs(s).some(isTabDirty);

function storeActive(): DocTab[] {
  const snap = snapshotActive();
  const s = get();
  return s.tabs.some((t) => t.id === snap.id) ? s.tabs.map((t) => (t.id === snap.id ? snap : t)) : [...s.tabs, snap];
}

export function activateTab(id: string): void {
  const s = get();
  if (id === s.tabId) return;
  const target = s.tabs.find((t) => t.id === id);
  if (!target) throw new Error(`Sprite not found: ${id}`);
  settleFloating();
  const tabs = storeActive();
  set({
    tabs,
    tabId: id,
    ...withoutKeys(target, ['id']),
    doc: target.history.present.doc,
    floating: null,
    playing: false,
  });
}

function tabFor(doc: SpriteDocument, filePath: string | null, createdBy: EditSource): DocTab {
  return {
    id: newTabId(),
    history: createHistory(doc),
    doc,
    savedDoc: filePath ? doc : null,
    filePath,
    layerId: doc.layers[doc.layers.length - 1].id,
    frameIndex: 0,
    activeTagId: null,
    frameRange: null,
    selection: null,
    zoom: 8,
    pan: null,
    createdBy,
  };
}

/** True for the untouched "sprite" the app starts with, which can be replaced silently. */
function activeIsPristine(): boolean {
  const s = get();
  return !s.filePath && s.history.past.length === 0 && s.history.future.length === 0 && !s.floating;
}

/**
 * Opens a document in a new tab (or in place of an untouched blank tab) and
 * activates it. Returns the tab id.
 */
export function openDocument(doc: SpriteDocument, filePath: string | null, createdBy: EditSource = 'user'): string {
  settleFloating();
  const tab = tabFor(doc, filePath, createdBy);
  const replace = activeIsPristine();
  const current = get().tabId;
  const tabs = replace ? get().tabs.filter((t) => t.id !== current) : storeActive();
  set({
    tabs: [...tabs, tab],
    tabId: tab.id,
    ...withoutKeys(tab, ['id']),
    floating: null,
    playing: false,
  });
  return tab.id;
}

/** Closes a tab (the caller confirms unsaved changes). The last tab is replaced by a blank sprite. */
export function closeTab(id: string): void {
  const all = allTabs();
  const index = all.findIndex((t) => t.id === id);
  if (index < 0) return;
  if (all.length === 1) {
    openDocument(createDocument({ name: 'sprite', width: 32, height: 32 }), null);
    set({ tabs: get().tabs.filter((t) => t.id !== id) });
    return;
  }
  if (id === get().tabId) {
    const next = all[index + 1] ?? all[index - 1];
    activateTab(next.id);
  }
  set({ tabs: get().tabs.filter((t) => t.id !== id) });
}

/** Kept for callers that replace the active document (e.g. tests); opens it like any other document. */
export function loadDocument(doc: SpriteDocument, filePath: string | null): void {
  openDocument(doc, filePath);
}

export function markSaved(filePath: string): void {
  set({ savedDoc: get().history.present.doc, filePath });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export function selectLayer(layerId: string): void {
  settleFloating();
  set({ layerId });
}

export function selectFrame(frameIndex: number, opts: { extendRange?: boolean } = {}): void {
  settleFloating();
  const s = get();
  const n = s.doc.frames.length;
  const index = ((frameIndex % n) + n) % n;
  if (opts.extendRange) {
    // Extend from the end of the range opposite to the current frame (like shift+click in a list).
    const anchor = s.frameRange ? (s.frameRange.from === s.frameIndex ? s.frameRange.to : s.frameRange.from) : s.frameIndex;
    set({ frameIndex: index, frameRange: { from: Math.min(anchor, index), to: Math.max(anchor, index) } });
  } else {
    set({ frameIndex: index, frameRange: null });
  }
}

export function togglePlaying(): void {
  set({ playing: !get().playing });
}

export function setTool(tool: ToolId): void {
  if (tool !== 'select') settleFloating();
  set({ tool });
}

export function swapColors(): void {
  const { primary, secondary } = get();
  set({ primary: secondary, secondary: primary });
}

// ---------------------------------------------------------------------------
// Selection & clipboard
// ---------------------------------------------------------------------------

export function setSelection(rect: Rect | null): void {
  const { doc } = get();
  set({ selection: rect ? clampRect(rect, doc.width, doc.height) : null });
}

export function selectAll(): void {
  settleFloating();
  const { doc } = get();
  set({ selection: { x: 0, y: 0, width: doc.width, height: doc.height } });
}

export function deselect(): void {
  settleFloating();
  set({ selection: null });
}

function activeCel() {
  const s = get();
  return { layerId: s.layerId, frameId: s.doc.frames[s.frameIndex].id };
}

/** Cuts the selected pixels out of the active cel so they can be dragged around. */
export function liftSelection(): boolean {
  const s = get();
  if (!s.selection || s.floating) return false;
  const { layerId, frameId } = activeCel();
  const present = s.history.present.doc;
  const region = copyRegion(present, layerId, frameId, s.selection);
  if (!region) return false;
  try {
    const base = clearCel(present, layerId, frameId, s.selection);
    set({ floating: { region, x: s.selection.x, y: s.selection.y, base, label: t.tools.select } });
    preview(pasteRegion(base, layerId, frameId, region, s.selection.x, s.selection.y));
    return true;
  } catch (e) {
    notify((e as Error).message, 'error');
    return false;
  }
}

export function moveFloating(x: number, y: number): void {
  const { floating } = get();
  if (!floating) return;
  const { layerId, frameId } = activeCel();
  set({
    floating: { ...floating, x, y },
    selection: { x, y, width: floating.region.width, height: floating.region.height },
  });
  preview(pasteRegion(floating.base, layerId, frameId, floating.region, x, y));
}

/** Commits a floating selection (if any) as a single undo step. */
export function settleFloating(): void {
  const { floating } = get();
  if (!floating) return;
  set({ floating: null });
  commitPreview(floating.label);
}

export function cancelFloating(): void {
  if (!get().floating) return;
  set({ floating: null, selection: null });
  cancelPreview();
}

export function copySelection(): boolean {
  const s = get();
  if (s.floating) {
    set({ clipboard: s.floating.region });
    return true;
  }
  if (!s.selection) {
    notify(t.status.noSelection);
    return false;
  }
  const { layerId, frameId } = activeCel();
  const region = copyRegion(s.history.present.doc, layerId, frameId, s.selection);
  if (region) set({ clipboard: region });
  notify(t.status.copied);
  return !!region;
}

export function deleteSelection(label: string = t.menu.deleteSelection): void {
  const s = get();
  if (s.floating) {
    // Dropping the floating pixels keeps the lifted (cleared) area.
    const base = s.floating.base;
    set({ floating: null, selection: null });
    preview(base);
    commitPreview(label);
    return;
  }
  if (!s.selection) return;
  const { layerId, frameId } = activeCel();
  commit((doc) => clearCel(doc, layerId, frameId, s.selection!), label);
}

export function cutSelection(): void {
  if (copySelection()) deleteSelection(t.menu.cut);
}

/** Pastes a region as a floating selection at (x, y) (default: current selection or top-left). */
export function pasteFloating(region: PixelRegion | null = get().clipboard, at?: Point, label: string = t.menu.paste): void {
  if (!region) {
    notify(t.status.nothingToPaste);
    return;
  }
  settleFloating();
  const s = get();
  const x = at?.x ?? s.selection?.x ?? 0;
  const y = at?.y ?? s.selection?.y ?? 0;
  const { layerId, frameId } = activeCel();
  const base = s.history.present.doc;
  try {
    const doc = pasteRegion(base, layerId, frameId, region, x, y);
    set({
      tool: 'select',
      floating: { region, x, y, base, label },
      selection: { x, y, width: region.width, height: region.height },
    });
    preview(doc);
  } catch (e) {
    notify((e as Error).message, 'error');
  }
}
