import type { Point } from '@easypixel/core';
import { useEditor } from './editor';

export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];

/** Size of the canvas viewport in CSS pixels, kept up to date by CanvasView. */
export const viewport = { width: 800, height: 600 };

export function fitZoom(docWidth: number, docHeight: number, viewWidth: number, viewHeight: number): number {
  const max = Math.min((viewWidth * 0.85) / docWidth, (viewHeight * 0.85) / docHeight);
  let best = ZOOM_LEVELS[0];
  for (const z of ZOOM_LEVELS) if (z <= max) best = z;
  return best;
}

export function fitToView(): void {
  const { doc } = useEditor.getState();
  const zoom = fitZoom(doc.width, doc.height, viewport.width, viewport.height);
  useEditor.setState({
    zoom,
    pan: {
      x: Math.round((viewport.width - doc.width * zoom) / 2),
      y: Math.round((viewport.height - doc.height * zoom) / 2),
    },
  });
}

/** Steps the zoom level keeping the sprite point under `anchor` (screen coords) fixed. */
export function stepZoom(direction: 1 | -1, anchor?: Point): void {
  const { zoom, pan } = useEditor.getState();
  if (!pan) return;
  const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom);
  const nextIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, (idx < 0 ? ZOOM_LEVELS.length - 1 : idx) + direction));
  const next = ZOOM_LEVELS[nextIdx];
  if (next === zoom) return;
  const a = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 };
  const sx = (a.x - pan.x) / zoom;
  const sy = (a.y - pan.y) / zoom;
  useEditor.setState({ zoom: next, pan: { x: Math.round(a.x - sx * next), y: Math.round(a.y - sy * next) } });
}
