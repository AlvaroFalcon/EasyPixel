import {
  addFrame,
  duplicateFrame,
  moveFrame,
  removeFrame,
  setFrameDuration,
  type SpriteDocument,
  type Tag,
} from '@easypixel/core';
import { useEffect, useRef } from 'react';
import { frameCanvas } from '../lib/frameCache';
import { openDialog } from '../store/actions';
import { commit, selectFrame, useEditor } from '../store/editor';
import { t } from '../strings';
import { Icon } from './Icon';

const THUMB = 48;
/** Must match .frame-cell width + .frame-strip gap in styles.css. */
const CELL = 64;
const GAP = 6;

const TAG_COLORS = ['#ff5fa2', '#5fd3ff', '#ffd25f', '#7dff8a', '#c08bff', '#ff9a5f', '#5fffd6', '#ff6b6b'];

export function tagColor(doc: SpriteDocument, tagId: string): string {
  const i = doc.tags.findIndex((tag) => tag.id === tagId);
  return TAG_COLORS[(i < 0 ? 0 : i) % TAG_COLORS.length];
}

function FrameThumb({ doc, index }: { doc: SpriteDocument; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const source = frameCanvas(doc, index);
  useEffect(() => {
    const canvas = ref.current!;
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width;
      canvas.height = source.height;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
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

/** Greedy lane assignment so overlapping animations stack instead of hiding each other. */
function layoutLanes(tags: Tag[]): { tag: Tag; lane: number }[] {
  const laneEnds: number[] = [];
  return [...tags]
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((tag) => {
      let lane = laneEnds.findIndex((end) => end < tag.from);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = tag.to;
      return { tag, lane };
    });
}

function TagLanes({ doc }: { doc: SpriteDocument }) {
  const activeTagId = useEditor((s) => s.activeTagId);
  if (doc.tags.length === 0) return null;
  const lanes = layoutLanes(doc.tags);
  const laneCount = Math.max(...lanes.map((l) => l.lane)) + 1;
  return (
    <div className="tag-lanes" style={{ height: laneCount * 22 }} data-testid="tags">
      {lanes.map(({ tag, lane }) => {
        const color = tagColor(doc, tag.id);
        const active = tag.id === activeTagId;
        return (
          <button
            key={tag.id}
            className={`tag-bar ${active ? 'active' : ''}`}
            style={{
              left: tag.from * (CELL + GAP),
              top: lane * 22,
              width: (tag.to - tag.from + 1) * (CELL + GAP) - GAP,
              borderColor: color,
              background: active ? color : `color-mix(in srgb, ${color} 22%, transparent)`,
              color: active ? '#15161b' : color,
            }}
            title={`${tag.name} · ${tag.from + 1}–${tag.to + 1} · ${t.animation[tag.direction]}${tag.loop ? ` · ${t.animation.loop}` : ''}`}
            onClick={() => {
              useEditor.setState({ activeTagId: active ? null : tag.id });
              if (!active) selectFrame(tag.from);
            }}
            onDoubleClick={() => openDialog({ kind: 'tag', tagId: tag.id })}
          >
            <span className="tag-name">{tag.name}</span>
            <span className="tag-flags">
              {tag.direction === 'reverse' ? '←' : tag.direction === 'pingpong' ? '↔' : '→'}
              {tag.loop ? '∞' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FramesPanel() {
  const doc = useEditor((s) => s.doc);
  const frameIndex = useEditor((s) => s.frameIndex);
  const frameRange = useEditor((s) => s.frameRange);
  const onionSkin = useEditor((s) => s.onionSkin);
  const onionRange = useEditor((s) => s.onionRange);
  const activeTag = useEditor((s) => s.doc.tags.find((tag) => tag.id === s.activeTagId) ?? null);
  const frame = doc.frames[frameIndex];
  const count = doc.frames.length;
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the current frame visible (e.g. while navigating with , and .).
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-frame="${frameIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [frameIndex]);

  const addAndSelect = (fn: (d: SpriteDocument) => SpriteDocument, label: string, newIndex: number) => {
    if (commit(fn, label)) selectFrame(newIndex);
  };

  const inRange = (i: number) => !!frameRange && i >= frameRange.from && i <= frameRange.to;

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
            data-testid="frame-duration"
            defaultValue={frame.duration}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== frame.duration && v >= 1) commit((d) => setFrameDuration(d, frame.id, v), t.frames.duration);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
        <span className="separator" />
        <label className="option" title={t.animation.onionHint}>
          <input
            type="checkbox"
            checked={onionSkin}
            data-testid="onion-skin"
            onChange={(e) => useEditor.setState({ onionSkin: e.target.checked })}
          />
          {t.animation.onionSkin}
        </label>
        {onionSkin && (
          <select value={onionRange} onChange={(e) => useEditor.setState({ onionRange: Number(e.target.value) })} title={t.animation.onionHint}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                ±{n}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar-spacer" />
        {activeTag && (
          <button className="text-button" onClick={() => openDialog({ kind: 'tag', tagId: activeTag.id })}>
            {t.animation.editTag}: {activeTag.name}
          </button>
        )}
        <button className="text-button accent" title={t.animation.newTagHint} data-testid="new-tag" onClick={() => openDialog({ kind: 'tag' })}>
          + {t.animation.newTag}
        </button>
      </div>
      <div className="frame-scroll" ref={stripRef}>
        <TagLanes doc={doc} />
        <ol className="frame-strip" data-testid="frames">
          {doc.frames.map((f, i) => (
            <li key={f.id}>
              <button
                data-frame={i}
                className={`frame-cell ${i === frameIndex ? 'active' : ''} ${inRange(i) ? 'in-range' : ''}`}
                onClick={(e) => selectFrame(i, { extendRange: e.shiftKey })}
                title={`${i + 1} · ${f.duration} ms`}
              >
                <FrameThumb doc={doc} index={i} />
                <span className="frame-number">{i + 1}</span>
                <span className="frame-duration">{f.duration}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
