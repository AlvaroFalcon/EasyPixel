import {
  addPaletteColor,
  alpha,
  PALETTE_PRESETS,
  parsePaletteFile,
  removePaletteColor,
  rgba,
  setPalette,
  toCss,
  toHex,
  tryParseHex,
  updatePaletteColor,
  type Color,
} from '@easypixel/core';
import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { openFile } from '../lib/platform';
import { commit, notify, swapColors, useEditor } from '../store/editor';
import { fmt, t } from '../strings';
import { Icon } from './Icon';

function Swatch({ color, className = '', ...rest }: { color: Color } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>) {
  return (
    <button className={`swatch ${className}`} {...rest}>
      <span style={{ background: toCss(color) }} />
    </button>
  );
}

/** Small RGBA editor: native color input + alpha + hex field. */
function ColorEditor({ initial, onApply, onCancel }: { initial: Color; onApply: (c: Color) => void; onCancel: () => void }) {
  const [color, setColor] = useState(initial);
  const [hex, setHex] = useState(toHex(initial));
  useEffect(() => setHex(toHex(color)), [color]);
  const a = alpha(color);
  const rgbHex = toHex(rgba((color >>> 24) & 255, (color >>> 16) & 255, (color >>> 8) & 255)).slice(0, 7);

  return (
    <div className="color-editor" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="color-editor-row">
        <input
          type="color"
          value={rgbHex}
          onChange={(e) => {
            const c = tryParseHex(e.target.value);
            if (c !== null) setColor(((c & 0xffffff00) | a) >>> 0);
          }}
        />
        <input
          className="hex-input"
          value={hex}
          spellCheck={false}
          onChange={(e) => {
            setHex(e.target.value);
            const c = tryParseHex(e.target.value);
            if (c !== null) setColor(c);
          }}
        />
        <span className="swatch preview">
          <span style={{ background: toCss(color) }} />
        </span>
      </div>
      <label className="color-editor-row">
        {t.palette.alpha}
        <input
          type="range"
          min={0}
          max={255}
          value={a}
          onChange={(e) => setColor(((color & 0xffffff00) | Number(e.target.value)) >>> 0)}
        />
        <span className="value">{a}</span>
      </label>
      <div className="color-editor-row end">
        <button onClick={onCancel}>{t.dialogs.cancel}</button>
        <button className="primary" onClick={() => onApply(color)}>
          {t.dialogs.ok}
        </button>
      </div>
    </div>
  );
}

type Editing = { target: 'primary' } | { target: 'secondary' } | { target: 'palette'; index: number } | null;

export function PalettePanel() {
  const palette = useEditor((s) => s.doc.palette);
  const primary = useEditor((s) => s.primary);
  const secondary = useEditor((s) => s.secondary);
  const [editing, setEditing] = useState<Editing>(null);

  const selectedIndex = palette.indexOf(primary);

  const apply = (c: Color) => {
    if (!editing) return;
    if (editing.target === 'primary') useEditor.setState({ primary: c });
    else if (editing.target === 'secondary') useEditor.setState({ secondary: c });
    else {
      const index = editing.index;
      if (commit((d) => updatePaletteColor(d, index, c), t.palette.title) && palette[index] === primary) {
        useEditor.setState({ primary: c });
      }
    }
    setEditing(null);
  };

  const applyPreset = (id: string) => {
    const preset = PALETTE_PRESETS.find((p) => p.id === id);
    if (!preset || !window.confirm(fmt(t.palette.replaceConfirm, { name: preset.name }))) return;
    commit((d) => setPalette(d, preset.colors), t.palette.title);
  };

  const importPalette = async () => {
    const file = await openFile({ title: t.palette.importFile, filters: [{ name: 'Palette', extensions: ['gpl', 'hex', 'txt'] }] });
    if (!file) return;
    const colors = parsePaletteFile(file.data as string, file.name);
    if (colors.length === 0) {
      notify(`${file.name}: 0 colores`, 'error');
      return;
    }
    commit((d) => setPalette(d, colors), t.palette.title);
  };

  const editingColor =
    editing?.target === 'primary' ? primary : editing?.target === 'secondary' ? secondary : editing ? palette[editing.index] : 0;

  return (
    <section className="panel palette-panel">
      <header className="panel-header">
        <h2>{t.palette.title}</h2>
        <select className="preset-select" value="" onChange={(e) => applyPreset(e.target.value)} title={t.palette.presets}>
          <option value="">{t.palette.presets}…</option>
          {PALETTE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.colors.length})
            </option>
          ))}
        </select>
      </header>

      <div className="current-colors">
        <Swatch
          color={primary}
          className="big primary-swatch"
          title={t.palette.primary}
          data-testid="primary-color"
          onClick={() => setEditing({ target: 'primary' })}
        />
        <Swatch color={secondary} className="big secondary-swatch" title={t.palette.secondary} onClick={() => setEditing({ target: 'secondary' })} />
        <button className="icon-button" title={t.palette.swap} onClick={swapColors}>
          <Icon name="swap" />
        </button>
        <span className="hex-label">{toHex(primary)}</span>
      </div>

      {editing && <ColorEditor key={JSON.stringify(editing)} initial={editingColor} onApply={apply} onCancel={() => setEditing(null)} />}

      <div className="swatches" title={t.palette.editHint} data-testid="palette">
        {palette.map((c, i) => (
          <Swatch
            key={i}
            color={c}
            className={i === selectedIndex ? 'selected' : ''}
            title={`${i}: ${toHex(c)}`}
            onClick={() => useEditor.setState({ primary: c })}
            onContextMenu={(e) => {
              e.preventDefault();
              useEditor.setState({ secondary: c });
            }}
            onDoubleClick={() => setEditing({ target: 'palette', index: i })}
          />
        ))}
      </div>

      <div className="panel-actions">
        <button className="icon-button" title={t.palette.addColor} onClick={() => commit((d) => addPaletteColor(d, primary), t.palette.title)}>
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          title={t.palette.removeColor}
          disabled={selectedIndex < 0}
          onClick={() => commit((d) => removePaletteColor(d, selectedIndex), t.palette.title)}
        >
          <Icon name="trash" />
        </button>
        <button className="text-button" onClick={() => void importPalette()}>
          {t.palette.importFile}
        </button>
      </div>
    </section>
  );
}
