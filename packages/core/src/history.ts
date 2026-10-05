import type { SpriteDocument } from './document';

/** Who made a change; shown in the history so Claude's edits can be told apart and undone. */
export type EditSource = 'user' | 'claude';

export interface HistoryEntry {
  doc: SpriteDocument;
  label: string;
  source: EditSource;
}

/**
 * Immutable undo/redo history. Because documents share unchanged data
 * (see ops.ts), keeping whole documents per step is cheap.
 */
export interface History {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
  limit: number;
}

export function createHistory(doc: SpriteDocument, limit = 200): History {
  return { past: [], present: { doc, label: 'Open', source: 'user' }, future: [], limit };
}

export function pushHistory(h: History, doc: SpriteDocument, label: string, source: EditSource = 'user'): History {
  if (doc === h.present.doc) return h;
  const past = [...h.past, h.present];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { ...h, past, present: { doc, label, source }, future: [] };
}

export function canUndo(h: History): boolean {
  return h.past.length > 0;
}

export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

export function undo(h: History): History {
  if (!canUndo(h)) return h;
  const past = h.past.slice(0, -1);
  return { ...h, past, present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!canRedo(h)) return h;
  const [next, ...future] = h.future;
  return { ...h, past: [...h.past, h.present], present: next, future };
}
