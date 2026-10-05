import {
  averageFps,
  frameAtTime,
  layoutSpritesheet,
  playbackFor,
  renderSpritesheet,
  type SpriteDocument,
} from '@easypixel/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { frameCanvas } from '../lib/frameCache';
import { regionToCanvas } from '../lib/image';
import { togglePlaying, useEditor } from '../store/editor';
import { fmt, t } from '../strings';
import { tagColor } from './FramesPanel';

const BOX_W = 236;
const BOX_H = 170;
type Scale = number | 'fit';

function scaleFor(scale: Scale, w: number, h: number): number {
  if (scale !== 'fit') return scale;
  const fit = Math.min(BOX_W / w, BOX_H / h);
  return fit >= 1 ? Math.floor(fit) : fit;
}

function activeTagOf(doc: SpriteDocument, id: string | null) {
  return doc.tags.find((tag) => tag.id === id) ?? null;
}

function AnimationView({ scale }: { scale: Scale }) {
  const doc = useEditor((s) => s.doc);
  const frameIndex = useEditor((s) => s.frameIndex);
  const playing = useEditor((s) => s.playing);
  const activeTagId = useEditor((s) => s.activeTagId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(frameIndex);

  const paint = (d: SpriteDocument, index: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !d.frames[index]) return;
    if (canvas.width !== d.width || canvas.height !== d.height) {
      canvas.width = d.width;
      canvas.height = d.height;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, d.width, d.height);
    ctx.drawImage(frameCanvas(d, index), 0, 0);
  };

  // Paused: mirror the frame being edited.
  useEffect(() => {
    if (playing) return;
    paint(doc, frameIndex);
    setShown(frameIndex);
  }, [playing, doc, frameIndex]);

  // Playing: drive frames from elapsed time so per-frame durations are exact.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    let raf = 0;
    let last = -1;
    const tick = (now: number) => {
      const { doc: d, activeTagId: id } = useEditor.getState();
      const pos = frameAtTime(playbackFor(d, activeTagOf(d, id)), now - start);
      // Always repaint: the document may change while playing (e.g. Claude drawing).
      paint(d, pos.frameIndex);
      if (pos.frameIndex !== last) {
        last = pos.frameIndex;
        setShown(pos.frameIndex);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, activeTagId]);

  const pb = playbackFor(doc, activeTagOf(doc, activeTagId));
  const k = scaleFor(scale, doc.width, doc.height);
  return (
    <>
      <div className="preview-box">
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          data-testid="preview-canvas"
          data-frame={shown}
          style={{ width: doc.width * k, height: doc.height * k }}
        />
      </div>
      <div className="preview-info">
        <span className="mono">
          {shown + 1}/{doc.frames.length}
        </span>
        <span className="mono muted">
          {fmt(t.animation.fps, { fps: averageFps(pb).toFixed(1).replace(/\.0$/, ''), ms: pb.total })}
        </span>
      </div>
    </>
  );
}

function SheetView({ scale }: { scale: Scale }) {
  const doc = useEditor((s) => s.doc);
  const ref = useRef<HTMLCanvasElement>(null);
  const columns = Math.ceil(Math.sqrt(doc.frames.length));
  const sheet = useMemo(() => renderSpritesheet(doc, layoutSpritesheet(doc, { columns })), [doc, columns]);
  useEffect(() => {
    regionToCanvas(sheet, ref.current!);
  }, [sheet]);
  const k = scaleFor(scale, sheet.width, sheet.height);
  return (
    <>
      <div className="preview-box">
        <canvas ref={ref} className="preview-canvas" style={{ width: sheet.width * k, height: sheet.height * k }} />
      </div>
      <div className="preview-info">
        <span className="mono">
          {columns}×{Math.ceil(doc.frames.length / columns)}
        </span>
        <span className="mono muted">
          {sheet.width}×{sheet.height} px
        </span>
      </div>
    </>
  );
}

export function PreviewPanel() {
  const [mode, setMode] = useState<'anim' | 'sheet'>('anim');
  const [scale, setScale] = useState<Scale>('fit');
  const playing = useEditor((s) => s.playing);
  const doc = useEditor((s) => s.doc);
  const activeTagId = useEditor((s) => s.activeTagId);

  return (
    <section className="panel preview-panel">
      <header className="panel-header">
        <h2>{t.animation.preview}</h2>
        <div className="segmented">
          <button className={mode === 'anim' ? 'active' : ''} onClick={() => setMode('anim')}>
            {t.animation.anim}
          </button>
          <button className={mode === 'sheet' ? 'active' : ''} onClick={() => setMode('sheet')}>
            {t.animation.sheet}
          </button>
        </div>
      </header>

      {mode === 'anim' ? <AnimationView scale={scale} /> : <SheetView scale={scale} />}

      <div className="preview-controls">
        {mode === 'anim' && (
          <>
            <button
              className={`play-button ${playing ? 'playing' : ''}`}
              onClick={togglePlaying}
              title={playing ? t.animation.pause : t.animation.play}
              data-testid="play"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <select
              value={activeTagId ?? ''}
              onChange={(e) => useEditor.setState({ activeTagId: e.target.value || null })}
              title={t.animation.title}
              data-testid="preview-tag"
              style={activeTagId ? { color: tagColor(doc, activeTagId) } : undefined}
            >
              <option value="">{t.animation.allFrames}</option>
              {doc.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </>
        )}
        <select
          className="scale-select"
          value={String(scale)}
          onChange={(e) => setScale(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
          title={t.animation.scale}
        >
          <option value="fit">{t.animation.fit}</option>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
