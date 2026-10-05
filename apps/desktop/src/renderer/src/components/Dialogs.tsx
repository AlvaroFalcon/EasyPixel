import {
  createDocument,
  DEFAULT_PALETTE,
  documentFromFrames,
  extractColors,
  layoutSpritesheet,
  MAX_CANVAS_SIZE,
  PALETTE_PRESETS,
  resizeCanvas,
  sliceSpritesheet,
  type Anchor,
  type PixelRegion,
} from '@easypixel/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { regionToCanvas } from '../lib/image';
import { closeDialog, exportImage, exportPng, newDocument, useDialog, type ExportOptions } from '../store/actions';
import { commit, pasteFloating, useEditor } from '../store/editor';
import { fmt, t } from '../strings';

function Modal({ title, children, onSubmit, submitLabel = t.dialogs.ok, valid = true }: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  valid?: boolean;
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
  const [opts, setOpts] = useState<ExportOptions>({ mode: doc.frames.length > 1 ? 'sheet' : 'frame', columns: doc.frames.length, spacing: 0, scale: 1 });
  const update = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const layout = layoutSpritesheet(doc, {
    frames: opts.mode === 'frame' ? [frameIndex] : undefined,
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
  }
}
