import {
  addFrame,
  addLayer,
  addTag,
  clearCel,
  compositeFrame,
  createDocument,
  documentToJson,
  duplicateFrame,
  ellipsePoints,
  encodeBase64,
  FILE_EXTENSION,
  flattenOnBackground,
  flipCel,
  floodFillPoints,
  gridToPixels,
  layoutSpritesheet,
  linePoints,
  overlayPixelGrid,
  paintPoints,
  PALETTE_PRESETS,
  parseHex,
  pixelsToGrid,
  rectPoints,
  removeFrame,
  removeLayer,
  removeTag,
  renderSpritesheet,
  replaceColor,
  resolveColor,
  resolveFrame,
  resolveLayer,
  scaleRegion,
  setFrameDuration,
  setGodotSettings,
  setPalette,
  setPixels,
  shiftCel,
  summarizeDocument,
  updateLayer,
  updateTag,
  type Color,
  type PixelRegion,
  type SpriteDocument,
} from '@easypixel/core';
import type { McpCall, McpToolResult, ToolArgs, ToolName } from '../../../shared/mcp';
import { exportToGodot } from '../lib/godot';
import { encodePng } from '../lib/image';
import { fileNameOf, saveFile } from '../lib/platform';
import {
  activateTab,
  allTabs,
  commitOrThrow,
  isTabDirty,
  markSaved,
  openDocument,
  undo,
  useEditor,
} from '../store/editor';
import { isDrawing } from '../store/tools';

/**
 * Executes MCP tool calls against the editor store. Every edit goes through
 * commitOrThrow with source "claude", so it is one undo step the user can
 * revert, and errors are returned to Claude as tool errors.
 */

const text = (t: string): McpToolResult => ({ content: [{ type: 'text', text: t }] });
const fail = (t: string): McpToolResult => ({ content: [{ type: 'text', text: t }], isError: true });

const state = () => useEditor.getState();
const present = () => state().history.present.doc;

function edit(label: string, fn: (doc: SpriteDocument) => SpriteDocument, select?: { layerId?: string; frameIndex?: number }) {
  return commitOrThrow(fn, label, { source: 'claude', select });
}

function target(args: { layer?: string | number; frame?: number }) {
  const doc = present();
  const s = state();
  const layerId = resolveLayer(doc, args.layer, s.layerId);
  const frameIndex = resolveFrame(doc, args.frame, s.frameIndex);
  const layerName = doc.layers.find((l) => l.id === layerId)!.name;
  return { doc, layerId, frameIndex, frameId: doc.frames[frameIndex].id, where: `frame ${frameIndex}, layer "${layerName}"` };
}

function outside(doc: SpriteDocument, points: { x: number; y: number }[]): number {
  return points.filter((p) => p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height).length;
}

function clippedNote(n: number): string {
  return n > 0 ? ` ${n} pixel(s) outside the canvas were ignored.` : '';
}

function parsePalette(input: string[] | string): Color[] {
  if (Array.isArray(input)) return input.map((c) => parseHex(c));
  const key = input.trim().toLowerCase().replace(/\s+/g, '-');
  const preset = PALETTE_PRESETS.find((p) => p.id === key || p.name.toLowerCase() === input.trim().toLowerCase());
  if (!preset) throw new Error(`Unknown palette preset "${input}". Presets: ${PALETTE_PRESETS.map((p) => p.id).join(', ')}`);
  return preset.colors;
}

function autoScale(width: number, height: number, requested?: number): number {
  if (requested) return requested;
  return Math.max(1, Math.min(32, Math.floor(512 / Math.max(width, height))));
}

async function imageResult(region: PixelRegion, opts: { scale?: number; grid?: boolean; background?: string }, caption: string): Promise<McpToolResult> {
  const k = autoScale(region.width, region.height, opts.scale);
  let img = scaleRegion(flattenOnBackground(region, opts.background ?? '#ffffff'), k);
  if (opts.grid !== false) img = overlayPixelGrid(img, k);
  const png = await encodePng(img);
  return {
    content: [
      { type: 'image', data: encodeBase64(png), mimeType: 'image/png' },
      { type: 'text', text: `${caption} Shown at ${k}x (${img.width}x${img.height}px).` },
    ],
  };
}

type Handlers = { [N in ToolName]: (args: ToolArgs<N>) => McpToolResult | Promise<McpToolResult> };

const handlers: Handlers = {
  get_editor_state() {
    const s = state();
    const doc = present();
    const layer = doc.layers.find((l) => l.id === s.layerId);
    return text(
      JSON.stringify(
        {
          sprites: allTabs(s).map((t) => ({
            id: t.id,
            name: t.doc.name,
            size: `${t.doc.width}x${t.doc.height}`,
            active: t.id === s.tabId,
            unsavedChanges: isTabDirty(t),
            file: t.filePath,
          })),
          active: {
            id: s.tabId,
            currentFrame: s.frameIndex,
            currentLayer: layer?.name,
            ...summarizeDocument(doc),
          },
        },
        null,
        1,
      ),
    );
  },

  create_sprite(args) {
    const palette = args.palette ? parsePalette(args.palette) : undefined;
    const doc = createDocument({ name: args.name, width: args.width, height: args.height, palette });
    const id = openDocument(doc, null, 'claude');
    return text(`Created sprite "${args.name}" (${args.width}x${args.height}, ${doc.palette.length} colors) with id ${id}. It is now the active tab.`);
  },

  select_sprite(args) {
    activateTab(args.sprite_id);
    return text(`Active sprite is now ${args.sprite_id} ("${present().name}").`);
  },

  set_palette(args) {
    const colors = args.colors.map((c) => parseHex(c));
    const doc = edit('set_palette', (d) => setPalette(d, args.mode === 'append' ? [...d.palette, ...colors] : colors));
    return text(`Palette has ${doc.palette.length} colors.`);
  },

  draw_grid(args) {
    const t = target(args);
    const writes = gridToPixels(
      { rows: args.rows, legend: args.legend, x: args.x, y: args.y, transparent: args.transparent },
      t.doc.palette,
    );
    edit('draw_grid', (d) => setPixels(d, t.layerId, t.frameId, writes), { layerId: t.layerId, frameIndex: t.frameIndex });
    const widths = new Set(args.rows.map((r) => [...r].length));
    const ragged = widths.size > 1 ? ` Warning: rows have different lengths (${[...widths].join(', ')}).` : '';
    return text(`Drew ${writes.length} pixels on ${t.where}.${clippedNote(outside(t.doc, writes))}${ragged}`);
  },

  draw_pixels(args) {
    const t = target(args);
    const writes = args.pixels.map((p) => ({ x: p.x, y: p.y, color: resolveColor(p.color, t.doc.palette) }));
    edit('draw_pixels', (d) => setPixels(d, t.layerId, t.frameId, writes), { layerId: t.layerId, frameIndex: t.frameIndex });
    return text(`Set ${writes.length} pixels on ${t.where}.${clippedNote(outside(t.doc, writes))}`);
  },

  draw_shape(args) {
    const t = target(args);
    const pts =
      args.shape === 'line'
        ? linePoints(args.from, args.to)
        : args.shape === 'rect'
          ? rectPoints(args.from, args.to, !!args.filled)
          : ellipsePoints(args.from, args.to, !!args.filled);
    const color = resolveColor(args.color, t.doc.palette);
    edit(`draw_shape (${args.shape})`, (d) => paintPoints(d, t.layerId, t.frameId, pts, color), {
      layerId: t.layerId,
      frameIndex: t.frameIndex,
    });
    return text(`Drew ${args.filled ? 'filled ' : ''}${args.shape} (${pts.length} pixels) on ${t.where}.${clippedNote(outside(t.doc, pts))}`);
  },

  fill(args) {
    const t = target(args);
    if (args.x < 0 || args.y < 0 || args.x >= t.doc.width || args.y >= t.doc.height) {
      throw new Error(`(${args.x}, ${args.y}) is outside the ${t.doc.width}x${t.doc.height} canvas`);
    }
    const color = resolveColor(args.color, t.doc.palette);
    const pts = floodFillPoints(t.doc.cels[`${t.layerId}/${t.frameId}`], t.doc.width, t.doc.height, args.x, args.y, args.contiguous !== false);
    edit('fill', (d) => paintPoints(d, t.layerId, t.frameId, pts, color), { layerId: t.layerId, frameIndex: t.frameIndex });
    return text(`Filled ${pts.length} pixels on ${t.where}.`);
  },

  clear(args) {
    const t = target(args);
    edit('clear', (d) => clearCel(d, t.layerId, t.frameId, args.rect), { layerId: t.layerId, frameIndex: t.frameIndex });
    return text(`Cleared ${args.rect ? 'a rectangle of ' : ''}${t.where}.`);
  },

  transform(args) {
    const t = target(args);
    edit(
      args.operation,
      (d) =>
        args.operation === 'shift'
          ? shiftCel(d, t.layerId, t.frameId, args.dx ?? 0, args.dy ?? 0, !!args.wrap)
          : flipCel(d, t.layerId, t.frameId, args.operation === 'flip_horizontal' ? 'horizontal' : 'vertical'),
      { layerId: t.layerId, frameIndex: t.frameIndex },
    );
    return text(`Applied ${args.operation} to ${t.where}.`);
  },

  replace_color(args) {
    const doc = present();
    const from = resolveColor(args.from, doc.palette);
    const to = resolveColor(args.to, doc.palette);
    edit('replace_color', (d) => replaceColor(d, from, to));
    return text(`Replaced color in every layer and frame.`);
  },

  add_layer(args) {
    const s = state();
    const doc = present();
    const activeIndex = doc.layers.findIndex((l) => l.id === s.layerId);
    const index = args.position === 'bottom' ? 0 : args.position === 'above_active' ? activeIndex + 1 : undefined;
    let created = '';
    edit('add_layer', (d) => {
      const r = addLayer(d, args.name, index);
      created = r.layer.id;
      return r.doc;
    });
    useEditor.setState({ layerId: created });
    const i = present().layers.findIndex((l) => l.id === created);
    return text(`Added layer "${args.name}" at index ${i} (0 = bottom). It is now the active layer.`);
  },

  update_layer(args) {
    const doc = present();
    const layerId = resolveLayer(doc, args.layer, state().layerId);
    const patch = Object.fromEntries(
      Object.entries({ name: args.name, visible: args.visible, opacity: args.opacity, locked: args.locked }).filter(([, v]) => v !== undefined),
    );
    edit('update_layer', (d) => updateLayer(d, layerId, patch));
    return text(`Updated layer: ${JSON.stringify(patch)}.`);
  },

  delete_layer(args) {
    const layerId = resolveLayer(present(), args.layer, state().layerId);
    edit('delete_layer', (d) => removeLayer(d, layerId));
    return text(`Deleted layer. ${present().layers.length} layer(s) left.`);
  },

  add_frame(args) {
    const doc = present();
    const after = args.after ?? doc.frames.length - 1;
    resolveFrame(doc, after, 0);
    const next = edit(
      args.duplicate ? 'duplicate_frame' : 'add_frame',
      (d) => {
        const r = args.duplicate ? duplicateFrame(d, d.frames[after].id) : addFrame(d, after + 1);
        return args.duration_ms ? setFrameDuration(r.doc, r.frame.id, args.duration_ms) : r.doc;
      },
      { frameIndex: after + 1 },
    );
    return text(
      `${args.duplicate ? 'Duplicated' : 'Added'} frame at index ${after + 1} (sprite now has ${next.frames.length} frames). It is now the active frame.`,
    );
  },

  delete_frame(args) {
    const doc = present();
    const i = resolveFrame(doc, args.frame, 0);
    edit('delete_frame', (d) => removeFrame(d, d.frames[i].id));
    return text(`Deleted frame ${i}. ${present().frames.length} frame(s) left.`);
  },

  set_frame_duration(args) {
    const doc = present();
    const indices = args.frames ?? doc.frames.map((_, i) => i);
    indices.forEach((i) => resolveFrame(doc, i, 0));
    edit('set_frame_duration', (d) => indices.reduce((acc, i) => setFrameDuration(acc, acc.frames[i].id, args.duration_ms), d));
    return text(`Set ${indices.length} frame(s) to ${args.duration_ms} ms.`);
  },

  create_animation(args) {
    let id = '';
    edit('create_animation', (d) => {
      const r = addTag(d, { name: args.name, from: args.from, to: args.to, direction: args.direction, loop: args.loop });
      id = r.tag.id;
      return r.doc;
    });
    useEditor.setState({ activeTagId: id });
    return text(`Created animation "${args.name}" with frames ${args.from}-${args.to}.`);
  },

  update_animation(args) {
    const tag = present().tags.find((t) => t.name === args.name);
    if (!tag) throw new Error(`Animation "${args.name}" not found. Animations: ${present().tags.map((t) => t.name).join(', ') || 'none'}`);
    const patch = Object.fromEntries(
      Object.entries({ name: args.new_name, from: args.from, to: args.to, direction: args.direction, loop: args.loop }).filter(
        ([, v]) => v !== undefined,
      ),
    );
    edit('update_animation', (d) => updateTag(d, tag.id, patch));
    return text(`Updated animation "${args.name}".`);
  },

  delete_animation(args) {
    const tag = present().tags.find((t) => t.name === args.name);
    if (!tag) throw new Error(`Animation "${args.name}" not found`);
    edit('delete_animation', (d) => removeTag(d, tag.id));
    return text(`Deleted animation "${args.name}".`);
  },

  get_frame_image(args) {
    const doc = present();
    const frameIndex = resolveFrame(doc, args.frame, state().frameIndex);
    const layerId = args.layer !== undefined ? resolveLayer(doc, args.layer, state().layerId) : null;
    const data = compositeFrame(doc, frameIndex, layerId ? { layerIds: [layerId], includeHidden: true } : {});
    const what = layerId ? `layer "${doc.layers.find((l) => l.id === layerId)!.name}"` : 'all visible layers';
    return imageResult(
      { width: doc.width, height: doc.height, data },
      args,
      `Frame ${frameIndex} of "${doc.name}" (${doc.width}x${doc.height}), ${what}.`,
    );
  },

  get_spritesheet_image(args) {
    const doc = present();
    let frames: number[] | undefined;
    if (args.animation) {
      const tag = doc.tags.find((t) => t.name === args.animation);
      if (!tag) throw new Error(`Animation "${args.animation}" not found. Animations: ${doc.tags.map((t) => t.name).join(', ') || 'none'}`);
      frames = [];
      for (let i = tag.from; i <= tag.to; i++) frames.push(i);
    }
    const layout = layoutSpritesheet(doc, { frames, columns: args.columns, spacing: 1 });
    const sheet = renderSpritesheet(doc, layout);
    const order = layout.cells.map((c) => c.frameIndex).join(', ');
    return imageResult(sheet, { ...args, grid: false, scale: args.scale ?? autoScale(sheet.width, sheet.height) }, `Frames ${order} (left to right, top to bottom, 1px gap).`);
  },

  get_frame_grid(args) {
    const doc = present();
    const frameIndex = resolveFrame(doc, args.frame, state().frameIndex);
    const layerId = args.layer !== undefined ? resolveLayer(doc, args.layer, state().layerId) : null;
    const data = compositeFrame(doc, frameIndex, layerId ? { layerIds: [layerId], includeHidden: true } : {});
    const grid = pixelsToGrid({ width: doc.width, height: doc.height, data }, doc.palette);
    return text(JSON.stringify({ frame: frameIndex, layer: layerId ? args.layer : 'all visible', width: doc.width, height: doc.height, ...grid }, null, 1));
  },

  undo(args) {
    const steps = args.steps ?? 1;
    const labels: string[] = [];
    for (let i = 0; i < steps && state().history.past.length > 0; i++) {
      labels.push(state().history.present.label);
      undo();
    }
    return text(labels.length ? `Undid: ${labels.join(', ')}.` : 'Nothing to undo.');
  },

  async export_godot(args) {
    const doc = present();
    const dir = args.directory ?? doc.godot?.dir;
    if (!dir) throw new Error('Pass `directory`: an absolute folder inside the Godot project (e.g. "/home/me/my_game/sprites/knight").');
    const settings = {
      dir,
      columns: args.columns ?? doc.godot?.columns,
      spacing: args.spacing ?? doc.godot?.spacing,
      scale: args.scale ?? doc.godot?.scale,
      autoplay: args.autoplay ?? doc.godot?.autoplay,
    };
    const clean = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined)) as typeof settings;
    const result = await exportToGodot(doc, clean);
    if (JSON.stringify(clean) !== JSON.stringify(doc.godot)) edit('export_godot settings', (d) => setGodotSettings(d, clean));
    return text(
      [
        `Exported to ${result.resDir}:`,
        ...result.written.map((p) => `- ${p}`),
        `Animations: ${result.animations.join(', ')}.`,
        `Use the .tscn directly, or the .tres as SpriteFrames of an AnimatedSprite2D. For a Sprite2D use the .png with hframes=${result.hframes}, vframes=${result.vframes}.`,
      ].join('\n'),
    );
  },

  async save_sprite(args) {
    const s = state();
    const path = args.path ?? s.filePath;
    if (!path) throw new Error('This sprite has never been saved: pass an absolute `path` ending in .epx.json');
    if (!path.endsWith(FILE_EXTENSION)) throw new Error(`The path must end in ${FILE_EXTENSION}`);
    const written = await saveFile({ path, data: documentToJson(present()) });
    if (!written) throw new Error('Saving was cancelled');
    markSaved(written);
    return text(`Saved "${present().name}" to ${written} (${fileNameOf(written)}).`);
  },
};

// Calls run one at a time, in arrival order.
let queue: Promise<unknown> = Promise.resolve();

async function waitForUserStroke(): Promise<void> {
  // Never apply an edit in the middle of the user's stroke (it would be overwritten).
  for (let i = 0; i < 100 && isDrawing(); i++) await new Promise((r) => setTimeout(r, 50));
}

async function run(call: McpCall): Promise<McpToolResult> {
  const handler = handlers[call.tool as ToolName] as ((args: unknown) => McpToolResult | Promise<McpToolResult>) | undefined;
  if (!handler) return fail(`Unknown tool: ${call.tool}`);
  await waitForUserStroke();
  useEditor.setState({ claudeActivity: { tool: call.tool, at: Date.now() } });
  try {
    const spriteId = call.args.sprite_id as string | undefined;
    if (spriteId && call.tool !== 'select_sprite') activateTab(spriteId);
    return await handler(call.args);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export function executeTool(call: McpCall): Promise<McpToolResult> {
  const result = queue.then(() => run(call));
  queue = result.catch(() => undefined);
  return result;
}
