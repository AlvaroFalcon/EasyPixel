import {
  addFrame,
  celKey,
  compositeFrame,
  duplicateFrame,
  moveFrame,
  removeFrame,
  setFrameDuration,
  type SpriteDocument,
} from '@easypixel/core';
import { useEffect, useRef } from 'react';
import { commit, selectFrame, useEditor } from '../store/editor';
import { t } from '../strings';
import { Icon } from './Icon';

const THUMB = 48;

/** Re-renders a frame thumbnail only when one of its cels (or the layer setup) changed. */
function FrameThumb({ doc, index }: { doc: SpriteDocument; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<unknown[]>([]);
  const frameId = doc.frames[index].id;
  const deps: unknown[] = [doc.width, doc.height, doc.layers, ...doc.layers.map((l) => doc.cels[celKey(l.id, frameId)])];

  useEffect(() => {
    if (deps.length === last.current.length && deps.every((d, i) => d === last.current[i])) return;
    last.current = deps;
    const canvas = ref.current!;
    canvas.width = doc.width;
    canvas.height = doc.height;
    canvas.getContext('2d')!.putImageData(new ImageData(compositeFrame(doc, index), doc.width, doc.height), 0, 0);
  });

  const scale = Math.min(THUMB / doc.width, THUMB / doc.height);
  return (
    <canvas
      ref={ref}
      className="frame-thumb"
      style={{ width: Math.max(1, Math.round(doc.width * scale)), height: Math.max(1, Math.round(doc.height * scale)) }}
    />
  );
}

export function FramesPanel() {
  const doc = useEditor((s) => s.doc);
  const frameIndex = useEditor((s) => s.frameIndex);
  const frame = doc.frames[frameIndex];
  const count = doc.frames.length;

  const addAndSelect = (fn: (d: SpriteDocument) => SpriteDocument, label: string, newIndex: number) => {
    if (commit(fn, label)) selectFrame(newIndex);
  };

  return (
    <section className="frames-panel">
      <div className="frames-toolbar">
        <h2>{t.frames.title}</h2>
        <button className="icon-button" title={t.frames.prev} onClick={() => selectFrame(frameIndex - 1)}>
          <Icon name="left" />
        </button>
        <span className="frame-counter" data-testid="frame-counter">
          {frameIndex + 1} / {count}
        </span>
        <button className="icon-button" title={t.frames.next} onClick={() => selectFrame(frameIndex + 1)}>
          <Icon name="right" />
        </button>
        <span className="separator" />
        <button
          className="icon-button"
          title={t.frames.add}
          data-testid="add-frame"
          onClick={() => addAndSelect((d) => addFrame(d, frameIndex + 1).doc, t.frames.add, frameIndex + 1)}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          title={t.frames.duplicate}
          data-testid="duplicate-frame"
          onClick={() => addAndSelect((d) => duplicateFrame(d, frame.id).doc, t.frames.duplicate, frameIndex + 1)}
        >
          <Icon name="duplicate" />
        </button>
        <button
          className="icon-button"
          title={t.frames.left}
          disabled={frameIndex === 0}
          onClick={() => addAndSelect((d) => moveFrame(d, frame.id, frameIndex - 1), t.frames.left, frameIndex - 1)}
        >
          <Icon name="left" />
          <Icon name="left" />
        </button>
        <button
          className="icon-button"
          title={t.frames.right}
          disabled={frameIndex === count - 1}
          onClick={() => addAndSelect((d) => moveFrame(d, frame.id, frameIndex + 1), t.frames.right, frameIndex + 1)}
        >
          <Icon name="right" />
          <Icon name="right" />
        </button>
        <button
          className="icon-button"
          title={t.frames.remove}
          disabled={count <= 1}
          onClick={() => commit((d) => removeFrame(d, frame.id), t.frames.remove)}
        >
          <Icon name="trash" />
        </button>
        <span className="separator" />
        <label className="option" title={t.frames.duration}>
          {t.frames.duration}
          <input
            key={`${frame.id}-${frame.duration}`}
            type="number"
            min={1}
            step={10}
            className="number-input"
            defaultValue={frame.duration}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== frame.duration && v >= 1) commit((d) => setFrameDuration(d, frame.id, v), t.frames.duration);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      </div>
      <ol className="frame-strip" data-testid="frames">
        {doc.frames.map((f, i) => (
          <li key={f.id}>
            <button className={`frame-cell ${i === frameIndex ? 'active' : ''}`} onClick={() => selectFrame(i)} title={`${i + 1} · ${f.duration} ms`}>
              <FrameThumb doc={doc} index={i} />
              <span className="frame-number">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
