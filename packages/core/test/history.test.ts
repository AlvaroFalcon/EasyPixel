import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createDocument, createHistory, pushHistory, redo, renameDocument, undo } from '../src';

describe('history', () => {
  it('undoes and redoes, clearing redo on new edits', () => {
    const d0 = createDocument({ width: 2, height: 2 });
    let h = createHistory(d0, 2);
    const d1 = renameDocument(d0, 'a');
    const d2 = renameDocument(d1, 'b');
    h = pushHistory(h, d1, 'rename');
    h = pushHistory(h, d2, 'rename', 'claude');
    expect(h.present.source).toBe('claude');
    h = undo(h);
    expect(h.present.doc).toBe(d1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.doc).toBe(d2);
    h = undo(h);
    h = pushHistory(h, renameDocument(d1, 'c'), 'rename');
    expect(canRedo(h)).toBe(false);
  });

  it('respects the limit and ignores no-op pushes', () => {
    const d0 = createDocument({ width: 2, height: 2 });
    let h = createHistory(d0, 2);
    expect(pushHistory(h, d0, 'noop')).toBe(h);
    for (const n of ['a', 'b', 'c', 'd']) h = pushHistory(h, renameDocument(h.present.doc, n), n);
    expect(h.past).toHaveLength(2);
    h = undo(undo(h));
    expect(canUndo(h)).toBe(false);
    expect(h.present.doc.name).toBe('b');
  });
});
