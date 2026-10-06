import { flipCel, clearCel } from '@easypixel/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isElectron } from '../lib/platform';
import { exportPalette, importPng, openDialog, openSprite, quickGodotExport, saveSprite } from '../store/actions';
import {
  commit,
  copySelection,
  cutSelection,
  deleteSelection,
  deselect,
  isDirty,
  pasteFloating,
  redo,
  redoAvailable,
  selectAll,
  undo,
  undoAvailable,
  useEditor,
} from '../store/editor';
import { loadReference } from '../store/reference';
import { fitToView, stepZoom } from '../store/view';
import { fileNameOf } from '../lib/platform';
import { LANGUAGES, setLanguage, t, useLanguage } from '../strings';
import { Icon } from './Icon';

const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl+';

export interface Item {
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  checked?: boolean;
}

export type Entry = Item | 'separator';

export function Menu({ label, items, align = 'left', title }: { label: ReactNode; items: Entry[]; align?: 'left' | 'right'; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`menu-button ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title={title} type="button">
        {label}
      </button>
      {open && (
        <div className={`menu-popup ${align}`} role="menu">
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={i} className="menu-separator" />
            ) : (
              <button
                key={i}
                role="menuitem"
                className="menu-item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
              >
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
                <span className="menu-label">{item.label}</span>
                <span className="menu-shortcut">{item.shortcut}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function withActiveCel(fn: (layerId: string, frameId: string) => void) {
  const s = useEditor.getState();
  fn(s.layerId, s.doc.frames[s.frameIndex].id);
}

export function MenuBar() {
  const canUndo = useEditor(undoAvailable);
  const canRedo = useEditor(redoAvailable);
  const hasSelection = useEditor((s) => !!s.selection);
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const showGrid = useEditor((s) => s.showGrid);
  const hasGodot = useEditor((s) => !!s.history.present.doc.godot);
  const tileGrid = useEditor((s) => s.tileGrid);
  const lang = useLanguage((s) => s.lang);
  const dirty = useEditor(isDirty);
  const name = useEditor((s) => (s.filePath ? fileNameOf(s.filePath) : `${s.doc.name} (${t.untitled})`));

  const file: Entry[] = [
    { label: t.menu.newSprite, shortcut: `${mod}N`, action: () => openDialog({ kind: 'new' }) },
    { label: t.menu.open, shortcut: `${mod}O`, action: () => void openSprite() },
    'separator',
    { label: t.menu.save, shortcut: `${mod}S`, action: () => void saveSprite() },
    ...(isElectron ? [{ label: t.menu.saveAs, shortcut: `${mod}⇧S`, action: () => void saveSprite(true) }] : []),
    'separator',
    { label: t.menu.importPng, shortcut: `${mod}I`, action: () => void importPng() },
    { label: t.menu.exportPng, shortcut: `${mod}E`, action: () => openDialog({ kind: 'export' }) },
    { label: t.godot.menuExport, action: () => openDialog({ kind: 'godot' }) },
    { label: t.godot.menuReexport, shortcut: `${mod}⇧E`, action: quickGodotExport, disabled: !hasGodot },
    { label: t.palette.exportFile, action: () => void exportPalette() },
  ];
  const edit: Entry[] = [
    { label: t.menu.undo, shortcut: `${mod}Z`, action: undo, disabled: !canUndo },
    { label: t.menu.redo, shortcut: `${mod}Y`, action: redo, disabled: !canRedo },
    'separator',
    { label: t.menu.cut, shortcut: `${mod}X`, action: cutSelection, disabled: !hasSelection },
    { label: t.menu.copy, shortcut: `${mod}C`, action: () => void copySelection(), disabled: !hasSelection },
    { label: t.menu.paste, shortcut: `${mod}V`, action: () => pasteFloating(), disabled: !hasClipboard },
    { label: t.menu.deleteSelection, shortcut: 'Supr', action: () => deleteSelection(), disabled: !hasSelection },
    'separator',
    { label: t.menu.selectAll, shortcut: `${mod}A`, action: selectAll },
    { label: t.menu.deselect, shortcut: `${mod}D`, action: deselect, disabled: !hasSelection },
  ];
  const sprite: Entry[] = [
    { label: t.menu.resize, action: () => openDialog({ kind: 'resize' }) },
    'separator',
    { label: t.menu.flipH, action: () => withActiveCel((l, f) => commit((d) => flipCel(d, l, f, 'horizontal'), t.menu.flipH)) },
    { label: t.menu.flipV, action: () => withActiveCel((l, f) => commit((d) => flipCel(d, l, f, 'vertical'), t.menu.flipV)) },
    { label: t.menu.clearCel, action: () => withActiveCel((l, f) => commit((d) => clearCel(d, l, f), t.menu.clearCel)) },
  ];
  const view: Entry[] = [
    { label: t.menu.toggleGrid, shortcut: `${mod}G`, checked: showGrid, action: () => useEditor.setState({ showGrid: !showGrid }) },
    ...[0, 8, 16, 32].map((n) => ({
      label: `${t.menu.tileGrid}: ${n ? `${n}×${n}` : t.menu.tileGridOff}`,
      checked: tileGrid === n,
      action: () => useEditor.setState({ tileGrid: n }),
    })),
    'separator',
    { label: t.menu.zoomIn, shortcut: '+', action: () => stepZoom(1) },
    { label: t.menu.zoomOut, shortcut: '-', action: () => stepZoom(-1) },
    { label: t.menu.zoomFit, shortcut: '0', action: fitToView },
    'separator',
    { label: t.reference.load, action: () => void loadReference() },
    'separator',
    ...LANGUAGES.map((l) => ({
      label: `${t.language.menu}: ${t.language[l]}`,
      checked: lang === l,
      action: () => setLanguage(l),
    })),
  ];

  return (
    <header className="menubar">
      <div className="brand">
        <span className="brand-mark" />
        EasyPixel
      </div>
      <Menu label={t.menu.file} items={file} />
      <Menu label={t.menu.edit} items={edit} />
      <Menu label={t.menu.sprite} items={sprite} />
      <Menu label={t.menu.view} items={view} />
      <Menu label="Claude" items={[{ label: t.mcp.menuConnect, action: () => openDialog({ kind: 'mcp' }) }]} />
      <div className="menubar-actions">
        <button className="icon-button" title={`${t.menu.undo} (${mod}Z)`} onClick={undo} disabled={!canUndo}>
          <Icon name="undo" />
        </button>
        <button className="icon-button" title={`${t.menu.redo} (${mod}Y)`} onClick={redo} disabled={!canRedo}>
          <Icon name="redo" />
        </button>
      </div>
      <div className="doc-title" data-testid="doc-title">
        {dirty && <span className="dirty-dot" title={t.unsavedChanges} />}
        {name}
      </div>
    </header>
  );
}
