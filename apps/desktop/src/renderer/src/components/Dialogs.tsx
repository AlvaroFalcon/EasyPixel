import {
  addTag,
  createDocument,
  DEFAULT_PALETTE,
  documentFromFrames,
  extractColors,
  layoutSpritesheet,
  MAX_CANVAS_SIZE,
  PALETTE_PRESETS,
  removeTag,
  resizeCanvas,
  setGodotSettings,
  setPalette,
  snakeName,
  toCss,
  toHex,
  type Color,
  type GodotExportSettings,
  updateTag,
  sliceSpritesheet,
  type Anchor,
  type PixelRegion,
  type TagDirection,
} from '@easypixel/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { regionToCanvas } from '../lib/image';
import { fetchLospecPalette, savePalette } from '../lib/paletteLibrary';
import { claudeCodeCommand, claudeDesktopConfig, useMcp } from '../mcp/connection';
import { closeDialog, exportImage, exportPng, newDocument, runGodotExport, useDialog, type ExportOptions } from '../store/actions';
import { godotProject, isElectron, pickDirectory } from '../lib/platform';
import type { GodotProjectInfo } from '../../../shared/api';
import { commit, notify, pasteFloating, useEditor } from '../store/editor';
import { fmt, t } from '../strings';

function Modal({ title, children, onSubmit, submitLabel = t.dialogs.ok, valid = true, extra }: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  valid?: boolean;
  /** Rendered at the left of the footer (e.g. a delete button). */
  extra?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <form
        className="modal"
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit();
        }}
        onKeyDown={(e) => e.key === 'Escape' && closeDialog()}
      >
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <footer>
          {extra && <div className="footer-extra">{extra}</div>}
          <button type="button" onClick={closeDialog}>
            {t.dialogs.cancel}
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

const validSize = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_CANVAS_SIZE;

function SizeFields({ width, height, onChange }: { width: number; height: number; onChange: (w: number, h: number) => void }) {
  return (
    <div className="field-row">
      <label>
        {t.dialogs.width}
        <input type="number" min={1} max={MAX_CANVAS_SIZE} value={width} onChange={(e) => onChange(Number(e.target.value), height)} />
      </label>
      <span className="times">×</span>
      <label>
        {t.dialogs.height}
        <input type="number" min={1} max={MAX_CANVAS_SIZE} value={height} onChange={(e) => onChange(width, Number(e.target.value))} />
      </label>
    </div>
  );
}

const SIZE_PRESETS = [8, 16, 24, 32, 48, 64, 128];

function NewSpriteDialog() {
  const [name, setName] = useState('sprite');
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);
  const [paletteId, setPaletteId] = useState('pico-8');
  const valid = validSize(width) && validSize(height) && name.trim() !== '';
  return (
    <Modal
      title={t.dialogs.newTitle}
      submitLabel={t.dialogs.create}
      valid={valid}
      onSubmit={() => {
        const palette = PALETTE_PRESETS.find((p) => p.id === paletteId)?.colors ?? DEFAULT_PALETTE;
        newDocument(createDocument({ name: name.trim(), width, height, palette }));
        closeDialog();
      }}
    >
      <label className="field">
        {t.dialogs.name}
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} data-testid="new-name" />
      </label>
      <div className="field">
        {t.dialogs.size}
        <div className="chips">
          {SIZE_PRESETS.map((n) => (
            <button
              type="button"
              key={n}
              className={`chip ${width === n && height === n ? 'active' : ''}`}
              onClick={() => {
                setWidth(n);
                setHeight(n);
              }}
            >
              {n}×{n}
            </button>
          ))}
        </div>
      </div>
      <SizeFields
        width={width}
        height={height}
        onChange={(w, h) => {
          setWidth(w);
          setHeight(h);
        }}
      />
      <label className="field">
        {t.dialogs.palette}
        <select value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
          {PALETTE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.colors.length})
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}

const ANCHORS: Anchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

function ResizeDialog() {
  const doc = useEditor((s) => s.doc);
  const [width, setWidth] = useState(doc.width);
  const [height, setHeight] = useState(doc.height);
  const [anchor, setAnchor] = useState<Anchor>('center');
  return (
    <Modal
      title={t.dialogs.resizeTitle}
      valid={validSize(width) && validSize(height)}
      onSubmit={() => {
        commit((d) => resizeCanvas(d, width, height, anchor), t.menu.resize);
        useEditor.setState({ pan: null, selection: null });
        closeDialog();
      }}
    >
      <SizeFields
        width={width}
        height={height}
        onChange={(w, h) => {
          setWidth(w);
          setHeight(h);
        }}
      />
      <div className="field">
        {t.dialogs.anchor}
        <div className="anchor-grid">
          {ANCHORS.map((a) => (
            <button type="button" key={a} className={`anchor ${a === anchor ? 'active' : ''}`} onClick={() => setAnchor(a)} title={a} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function RegionPreview({ region, max = 240 }: { region: PixelRegion; max?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    regionToCanvas(region, ref.current!);
  }, [region]);
  const scale = Math.max(1, Math.floor(Math.min(max / region.width, max / region.height))) || 1;
  const fit = Math.min(1, max / (region.width * scale), max / (region.height * scale));
  return (
    <canvas
      ref={ref}
      className="region-preview"
      style={{ width: region.width * scale * fit, height: region.height * scale * fit }}
    />
  );
}

function ImportDialog({ image, fileName }: { image: PixelRegion; fileName: string }) {
  const [mode, setMode] = useState<'new' | 'layer'>('new');
  const [frameW, setFrameW] = useState(image.width);
  const [frameH, setFrameH] = useState(image.height);
  const [spacing, setSpacing] = useState(0);
  const [margin, setMargin] = useState(0);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [usePalette, setUsePalette] = useState(true);

  const frames = useMemo(() => {
    try {
      return sliceSpritesheet(image, { frameWidth: frameW, frameHeight: frameH, spacing, margin, skipEmpty });
    } catch {
      return [];
    }
  }, [image, frameW, frameH, spacing, margin, skipEmpty]);

  const valid = mode === 'layer' || (frames.length > 0 && validSize(frameW) && validSize(frameH));

  return (
    <Modal
      title={`${t.dialogs.importTitle}: ${fileName}`}
      valid={valid}
      onSubmit={() => {
        if (mode === 'layer') {
          pasteFloating(image, { x: 0, y: 0 }, t.menu.importPng);
        } else {
          const colors = extractColors(image, 256);
          const palette = usePalette && colors.length <= 64 ? colors : undefined;
          newDocument(documentFromFrames(fileName.replace(/\.png$/i, ''), frames, palette));
        }
        closeDialog();
      }}
    >
      <div className="import-layout">
        <RegionPreview region={image} />
        <div className="import-options">
          <p className="muted">
            {image.width}×{image.height} px
          </p>
          <label className="radio">
            <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
            <span>
              <strong>{t.dialogs.importAsNew}</strong>
              <small>{t.dialogs.importAsNewHint}</small>
            </span>
          </label>
          {mode === 'new' && (
            <div className="indent">
              <div className="field">{t.dialogs.frameSize}</div>
              <SizeFields
                width={frameW}
                height={frameH}
                onChange={(w, h) => {
                  setFrameW(w);
                  setFrameH(h);
                }}
              />
              <div className="field-row">
                <label>
                  {t.dialogs.spacing}
                  <input type="number" min={0} value={spacing} onChange={(e) => setSpacing(Math.max(0, Number(e.target.value)))} />
                </label>
                <label>
                  {t.dialogs.margin}
                  <input type="number" min={0} value={margin} onChange={(e) => setMargin(Math.max(0, Number(e.target.value)))} />
                </label>
              </div>
              <label className="option">
                <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
                {t.dialogs.skipEmpty}
              </label>
              <label className="option">
                <input type="checkbox" checked={usePalette} onChange={(e) => setUsePalette(e.target.checked)} />
                {t.dialogs.usePaletteFromImage}
              </label>
              <p className="muted">{fmt(t.dialogs.framesDetected, { n: frames.length })}</p>
            </div>
          )}
          <label className="radio">
            <input type="radio" checked={mode === 'layer'} onChange={() => setMode('layer')} />
            <span>
              <strong>{t.dialogs.importIntoLayer}</strong>
              <small>{t.dialogs.importIntoLayerHint}</small>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

function ExportDialog() {
  const doc = useEditor((s) => s.history.present.doc);
  const frameIndex = useEditor((s) => s.frameIndex);
  const activeTagId = useEditor((s) => s.activeTagId);
  const [opts, setOpts] = useState<ExportOptions>({
    mode: doc.frames.length > 1 ? 'sheet' : 'frame',
    columns: doc.frames.length,
    spacing: 0,
    scale: 1,
    tagId: activeTagId,
  });
  const update = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const layout = layoutSpritesheet(doc, {
    frames: opts.mode === 'sheet' ? undefined : [frameIndex],
    columns: opts.columns,
    spacing: opts.spacing,
  });
  const preview = useMemo(() => exportImage(doc, frameIndex, { ...opts, scale: 1 }), [doc, frameIndex, opts]);

  return (
    <Modal
      title={t.dialogs.exportTitle}
      submitLabel={t.dialogs.export}
      onSubmit={() => {
        closeDialog();
        void exportPng(opts);
      }}
    >
      <div className="import-layout">
        <RegionPreview region={preview} />
        <div className="import-options">
          <label className="radio">
            <input type="radio" checked={opts.mode === 'frame'} onChange={() => update({ mode: 'frame' })} />
            <strong>{t.dialogs.exportCurrent}</strong>
          </label>
          <label className="radio">
            <input type="radio" checked={opts.mode === 'sheet'} onChange={() => update({ mode: 'sheet' })} />
            <strong>{t.dialogs.exportSheet}</strong>
          </label>
          <label className="radio">
            <input type="radio" checked={opts.mode === 'gif'} onChange={() => update({ mode: 'gif' })} data-testid="export-gif" />
            <strong>{t.dialogs.exportGif}</strong>
          </label>
          {opts.mode === 'gif' && (
            <label className="field indent">
              {t.animation.title}
              <select value={opts.tagId ?? ''} onChange={(e) => update({ tagId: e.target.value || null })}>
                <option value="">{t.animation.allFrames}</option>
                {doc.tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {opts.mode === 'sheet' && (
            <div className="field-row indent">
              <label>
                {t.dialogs.columns}
                <input
                  type="number"
                  min={1}
                  max={doc.frames.length}
                  value={opts.columns}
                  onChange={(e) => update({ columns: Math.max(1, Number(e.target.value)) })}
                />
              </label>
              <label>
                {t.dialogs.spacing}
                <input type="number" min={0} value={opts.spacing} onChange={(e) => update({ spacing: Math.max(0, Number(e.target.value)) })} />
              </label>
            </div>
          )}
          <label className="field">
            {t.dialogs.scale}
            <select value={opts.scale} onChange={(e) => update({ scale: Number(e.target.value) })}>
              {[1, 2, 3, 4, 6, 8, 10].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{fmt(t.dialogs.resultSize, { w: layout.width * opts.scale, h: layout.height * opts.scale })}</p>
        </div>
      </div>
    </Modal>
  );
}

const DIRECTIONS: TagDirection[] = ['forward', 'reverse', 'pingpong'];

function TagDialog({ tagId }: { tagId?: string }) {
  const doc = useEditor((s) => s.history.present.doc);
  const frameIndex = useEditor((s) => s.frameIndex);
  const frameRange = useEditor((s) => s.frameRange);
  const existing = doc.tags.find((tag) => tag.id === tagId);
  const [name, setName] = useState(existing?.name ?? (doc.tags.length === 0 ? 'idle' : ''));
  // The dialog shows 1-based frame numbers, like the timeline.
  const [from, setFrom] = useState((existing?.from ?? frameRange?.from ?? frameIndex) + 1);
  const [to, setTo] = useState((existing?.to ?? frameRange?.to ?? frameIndex) + 1);
  const [direction, setDirection] = useState<TagDirection>(existing?.direction ?? 'forward');
  const [loop, setLoop] = useState(existing?.loop ?? true);

  const trimmed = name.trim();
  const duplicate = doc.tags.some((tag) => tag.name === trimmed && tag.id !== tagId);
  const n = doc.frames.length;
  const valid = trimmed !== '' && !duplicate && from >= 1 && to >= from && to <= n;

  return (
    <Modal
      title={existing ? t.animation.editTag : t.animation.newTag}
      submitLabel={existing ? t.dialogs.ok : t.dialogs.create}
      valid={valid}
      extra={
        existing && (
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!window.confirm(fmt(t.animation.removeConfirm, { name: existing.name }))) return;
              commit((d) => removeTag(d, existing.id), t.animation.remove);
              closeDialog();
            }}
          >
            {t.animation.remove}
          </button>
        )
      }
      onSubmit={() => {
        const fields = { name: trimmed, from: from - 1, to: to - 1, direction, loop };
        if (existing) {
          commit((d) => updateTag(d, existing.id, fields), t.animation.editTag);
        } else {
          let created = '';
          commit((d) => {
            const r = addTag(d, fields);
            created = r.tag.id;
            return r.doc;
          }, t.animation.newTag);
          if (created) useEditor.setState({ activeTagId: created, frameRange: null });
        }
        closeDialog();
      }}
    >
      <label className="field">
        {t.dialogs.name}
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} data-testid="tag-name" placeholder="walk" />
        <small className={duplicate ? 'error-text' : 'muted'}>{duplicate ? t.animation.nameExists : t.animation.nameHint}</small>
      </label>
      <div className="field-row">
        <label>
          {t.animation.from}
          <input type="number" min={1} max={n} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
        </label>
        <label>
          {t.animation.to}
          <input type="number" min={1} max={n} value={to} onChange={(e) => setTo(Number(e.target.value))} />
        </label>
      </div>
      <div className="field">
        {t.animation.direction}
        <div className="chips">
          {DIRECTIONS.map((d) => (
            <button type="button" key={d} className={`chip ${direction === d ? 'active' : ''}`} onClick={() => setDirection(d)}>
              {t.animation[d]}
            </button>
          ))}
        </div>
      </div>
      <label className="option">
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
        {t.animation.loop}
      </label>
    </Modal>
  );
}

function GodotDialog() {
  const doc = useEditor((s) => s.history.present.doc);
  const saved = doc.godot;
  const [dir, setDir] = useState(saved?.dir ?? '');
  const [columns, setColumns] = useState(saved?.columns ?? Math.min(doc.frames.length, 16));
  const [spacing, setSpacing] = useState(saved?.spacing ?? 0);
  const [scale, setScale] = useState(saved?.scale ?? 1);
  const [autoplay, setAutoplay] = useState(saved?.autoplay ?? (doc.tags.find((tag) => tag.name === 'idle') ?? doc.tags[0])?.name ?? '');
  const [mode, setMode] = useState<'sprite' | 'tileset'>(saved?.mode ?? 'sprite');
  const [tileW, setTileW] = useState(saved?.tileWidth ?? useEditor.getState().tileGrid ?? 16);
  const [tileH, setTileH] = useState(saved?.tileHeight ?? useEditor.getState().tileGrid ?? 16);
  const [remember, setRemember] = useState(true);
  const [project, setProject] = useState<GodotProjectInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isElectron || !dir) {
      setProject(undefined);
      return;
    }
    let cancelled = false;
    void godotProject(dir).then((info) => !cancelled && setProject(info));
    return () => {
      cancelled = true;
    };
  }, [dir]);

  const n = doc.frames.length;
  const cols = Math.max(1, Math.min(columns || 1, n));
  const rows = Math.ceil(n / cols);
  const base = snakeName(doc.name);
  const tileFits = tileW >= 1 && tileH >= 1 && doc.width % tileW === 0 && doc.height % tileH === 0;
  const valid = !busy && (isElectron ? !!dir && !!project : true) && (mode === 'sprite' || tileFits);

  return (
    <Modal
      title={t.godot.title}
      submitLabel={t.dialogs.export}
      valid={valid}
      onSubmit={() => {
        const settings: GodotExportSettings =
          mode === 'tileset'
            ? { dir: isElectron ? dir : 'res://', mode, tileWidth: tileW, tileHeight: tileH }
            : {
                dir: isElectron ? dir : 'res://',
                columns: cols,
                spacing,
                scale,
                ...(autoplay ? { autoplay } : {}),
              };
        if (remember && isElectron && JSON.stringify(settings) !== JSON.stringify(saved)) {
          commit((d) => setGodotSettings(d, settings), t.godot.menuExport);
        }
        setBusy(true);
        void runGodotExport(settings).then((ok) => {
          setBusy(false);
          if (ok) closeDialog();
        });
      }}
    >
      <div className="segmented wide">
        <button type="button" className={mode === 'sprite' ? 'active' : ''} onClick={() => setMode('sprite')}>
          {t.godot.modeSprite}
        </button>
        <button type="button" className={mode === 'tileset' ? 'active' : ''} onClick={() => setMode('tileset')} data-testid="godot-tileset">
          {t.godot.modeTileset}
        </button>
      </div>
      {isElectron ? (
        <div className="field">
          {t.godot.folder}
          <div className="field-row">
            <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder={t.godot.folderPlaceholder} data-testid="godot-dir" />
            <button
              type="button"
              onClick={() => void pickDirectory(t.godot.folder).then((picked) => picked && setDir(picked))}
            >
              {t.godot.choose}
            </button>
          </div>
          {dir && project && (
            <small className="muted">
              {fmt(t.godot.detected, { root: project.root })} · <span className="mono">{fmt(t.godot.resPath, { res: project.resDir })}</span>
            </small>
          )}
          {dir && project === null && <small className="error-text">{t.godot.notProject}</small>}
        </div>
      ) : (
        <p className="muted">{t.godot.browserNote}</p>
      )}
      {mode === 'sprite' ? (
        <>
      <div className="field-row">
        <label>
          {t.godot.columns}
          <input type="number" min={1} max={n} value={columns} onChange={(e) => setColumns(Number(e.target.value))} />
        </label>
        <label>
          {t.godot.spacing}
          <input type="number" min={0} value={spacing} onChange={(e) => setSpacing(Math.max(0, Number(e.target.value)))} />
        </label>
        <label>
          {t.godot.scale}
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k}×
              </option>
            ))}
          </select>
        </label>
      </div>
      {doc.tags.length > 0 ? (
        <label className="field">
          {t.godot.autoplay}
          <select value={autoplay} onChange={(e) => setAutoplay(e.target.value)}>
            {doc.tags.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted">{t.godot.noTagsHint}</p>
      )}
      <div className="field">
        {t.godot.files}
        <ul className="file-list">
          <li>
            <span className="mono">{base}.png</span> —{' '}
            {fmt(t.godot.pngHint, {
              w: (cols * doc.width + (cols - 1) * spacing) * scale,
              h: (rows * doc.height + (rows - 1) * spacing) * scale,
              h1: cols,
              v1: rows,
            })}
          </li>
          <li>
            <span className="mono">{base}.tres</span> —{' '}
            {fmt(t.godot.tresHint, {
              n: Math.max(1, doc.tags.length),
              names: doc.tags.length ? doc.tags.map((tag) => tag.name).join(', ') : 'default',
            })}
          </li>
          <li>
            <span className="mono">{base}.tscn</span> — {t.godot.tscnHint}
          </li>
        </ul>
        {doc.tags.some((tag) => tag.direction !== 'forward') && <small className="muted">{t.godot.pingpongHint}</small>}
      </div>
        </>
      ) : (
        <>
      <div className="field-row">
        <label>
          {t.godot.tileWidth}
          <input type="number" min={1} value={tileW} onChange={(e) => setTileW(Number(e.target.value))} data-testid="tile-w" />
        </label>
        <label>
          {t.godot.tileHeight}
          <input type="number" min={1} value={tileH} onChange={(e) => setTileH(Number(e.target.value))} />
        </label>
      </div>
      {!tileFits && <p className="error-text">{fmt(t.godot.tileMismatch, { w: doc.width, h: doc.height })}</p>}
      <div className="field">
        {t.godot.files}
        <ul className="file-list">
          <li>
            <span className="mono">{base}.png</span> — {fmt(t.godot.tilesPngHint, { w: doc.width, h: doc.height })}
          </li>
          <li>
            <span className="mono">{base}_tileset.tres</span> —{' '}
            {fmt(t.godot.tilesetHint, { c: tileFits ? doc.width / tileW : '?', r: tileFits ? doc.height / tileH : '?' })}
          </li>
        </ul>
        <small className="muted">{t.godot.tilesetUsage}</small>
      </div>
        </>
      )}
      {isElectron && (
        <label className="option">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t.godot.remember}
        </label>
      )}
    </Modal>
  );
}

function SavePaletteDialog() {
  const palette = useEditor((s) => s.doc.palette);
  const docName = useEditor((s) => s.doc.name);
  const [name, setName] = useState(docName);
  return (
    <Modal
      title={t.palette.saveTitle}
      valid={name.trim() !== '' && palette.length > 0}
      onSubmit={() => {
        savePalette(name.trim(), palette);
        notify(fmt(t.palette.saved, { name: name.trim() }));
        closeDialog();
      }}
    >
      <label className="field">
        {t.dialogs.name}
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} data-testid="palette-name" />
      </label>
      <PaletteStrip colors={palette} />
    </Modal>
  );
}

function PaletteStrip({ colors }: { colors: Color[] }) {
  return (
    <div className="palette-strip">
      {colors.map((c, i) => (
        <span key={i} style={{ background: toCss(c) }} title={toHex(c)} />
      ))}
    </div>
  );
}

function LospecDialog() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ name: string; colors: Color[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [save, setSave] = useState(true);
  const search = () => {
    setLoading(true);
    setError('');
    fetchLospecPalette(query)
      .then(setResult)
      .catch((e: Error) => {
        setResult(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  };
  return (
    <Modal
      title={t.palette.lospecTitle}
      submitLabel={t.palette.lospecApply}
      valid={!!result}
      onSubmit={() => {
        if (!result) return;
        commit((d) => setPalette(d, result.colors), t.palette.title);
        if (save) savePalette(result.name, result.colors);
        closeDialog();
      }}
    >
      <p className="muted">{t.palette.lospecHint}</p>
      <div className="field-row">
        <input
          autoFocus
          value={query}
          placeholder="resurrect-64"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" disabled={!query.trim() || loading} onClick={search}>
          {loading ? '…' : t.palette.lospecSearch}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {result && (
        <>
          <strong>
            {result.name} ({result.colors.length})
          </strong>
          <PaletteStrip colors={result.colors} />
          <label className="option">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            {t.palette.lospecSave}
          </label>
        </>
      )}
    </Modal>
  );
}

function CodeRow({ title, hint, code }: { title: string; hint: string; code: string }) {
  return (
    <section className="code-row">
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => notify(t.mcp.copied));
          }}
        >
          {t.mcp.copy}
        </button>
      </header>
      <small className="muted">{hint}</small>
      <pre className="code-block">{code}</pre>
    </section>
  );
}

function McpDialog() {
  const status = useMcp((s) => s.status);
  return (
    <Modal title={t.mcp.connectTitle} submitLabel={t.dialogs.ok} onSubmit={closeDialog}>
      <p className="muted">{t.mcp.intro}</p>
      {!status ? (
        <p className="error-text">{t.mcp.webOnly}</p>
      ) : (
        <>
          <div className="status-line">
            <span className={`mcp-indicator ${status.state}`}>
              <span className="mcp-dot" />
            </span>
            {status.state === 'error' ? (
              <span className="error-text">{fmt(t.mcp.error, { error: status.error ?? '' })}</span>
            ) : (
              <span className="mono">{fmt(t.mcp.listening, { url: status.url })}</span>
            )}
          </div>
          <CodeRow title={t.mcp.claudeCode} hint={t.mcp.claudeCodeHint} code={claudeCodeCommand(status)} />
          <CodeRow title={t.mcp.claudeDesktop} hint={t.mcp.claudeDesktopHint} code={claudeDesktopConfig(status)} />
          <p className="muted">
            {t.mcp.tryPrompt} <em>«{t.mcp.examplePrompt}»</em>
          </p>
          <small className="muted">{t.mcp.keepOpen}</small>
        </>
      )}
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useDialog((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'new':
      return <NewSpriteDialog />;
    case 'resize':
      return <ResizeDialog />;
    case 'import':
      return <ImportDialog image={dialog.image} fileName={dialog.fileName} />;
    case 'export':
      return <ExportDialog />;
    case 'tag':
      return <TagDialog tagId={dialog.tagId} />;
    case 'mcp':
      return <McpDialog />;
    case 'godot':
      return <GodotDialog />;
    case 'palette-save':
      return <SavePaletteDialog />;
    case 'lospec':
      return <LospecDialog />;
  }
}
