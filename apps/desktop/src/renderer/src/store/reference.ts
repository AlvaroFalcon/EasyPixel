import { create } from 'zustand';
import { decodeImage, regionToCanvas } from '../lib/image';
import { openFile } from '../lib/platform';
import { t } from '../strings';
import { notify, useEditor } from './editor';

/** A guide image shown with the sprite (never exported). One per tab, kept in memory only. */
export interface ReferenceImage {
  canvas: HTMLCanvasElement;
  name: string;
  opacity: number;
  visible: boolean;
  /** Draw on top of the sprite (for tracing) instead of behind it. */
  above: boolean;
  /** Scale relative to "fit inside the canvas". */
  zoom: number;
}

export const useReference = create<{ byTab: Record<string, ReferenceImage> }>(() => ({ byTab: {} }));

export function activeReference(): ReferenceImage | undefined {
  return useReference.getState().byTab[useEditor.getState().tabId];
}

export function updateReference(patch: Partial<ReferenceImage>): void {
  const tabId = useEditor.getState().tabId;
  const current = useReference.getState().byTab[tabId];
  if (!current) return;
  useReference.setState((s) => ({ byTab: { ...s.byTab, [tabId]: { ...current, ...patch } } }));
}

export function removeReference(): void {
  const tabId = useEditor.getState().tabId;
  useReference.setState((s) => {
    const byTab = { ...s.byTab };
    delete byTab[tabId];
    return { byTab };
  });
}

export async function loadReference(): Promise<void> {
  try {
    const file = await openFile({
      title: t.reference.load,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      binary: true,
    });
    if (!file) return;
    const canvas = regionToCanvas(await decodeImage(file.data as Uint8Array));
    const tabId = useEditor.getState().tabId;
    useReference.setState((s) => ({
      byTab: { ...s.byTab, [tabId]: { canvas, name: file.name, opacity: 0.5, visible: true, above: false, zoom: 1 } },
    }));
  } catch (e) {
    notify((e as Error).message, 'error');
  }
}

/** Where the reference is drawn, in sprite pixels: fitted inside the canvas, centered. */
export function referenceRect(ref: ReferenceImage, docW: number, docH: number) {
  const fit = Math.min(docW / ref.canvas.width, docH / ref.canvas.height) * ref.zoom;
  const w = ref.canvas.width * fit;
  const h = ref.canvas.height * fit;
  return { x: (docW - w) / 2, y: (docH - h) / 2, w, h };
}
