/**
 * Godot 4 export: a grid spritesheet PNG, a SpriteFrames resource (.tres) with
 * one AtlasTexture per frame and one animation per tag, and a ready-to-use
 * AnimatedSprite2D scene (.tscn) with nearest-neighbour filtering.
 *
 * Text formats follow Godot 4's text resource syntax (format=3).
 */
import { tagFrameSequence } from './animation';
import type { SpriteDocument } from './document';
import type { PixelRegion } from './pixels';
import { layoutSpritesheet, renderSpritesheet, scaleRegion, type SheetLayout } from './spritesheet';

export interface GodotExportOptions {
  /** Godot path of the folder the files go to, e.g. "res://sprites/knight". */
  resDir: string;
  /** File name without extension. Default: snake_case document name. */
  baseName?: string;
  /** Frames per row in the sheet. Default: all frames in one row (up to 16 per row). */
  columns?: number;
  /** Pixels between frames. */
  spacing?: number;
  /** Integer upscale. Godot projects usually keep 1 and scale with the viewport. */
  scale?: number;
  /** Animation played automatically by the generated scene. Default: "idle" if present, else the first. */
  autoplay?: string;
}

export interface GodotAnimation {
  name: string;
  /** Frame indices in play order (reverse/pingpong already expanded). */
  frames: number[];
  /** Relative durations (Godot multiplies them by 1 / speed). */
  durations: number[];
  speed: number;
  loop: boolean;
}

export interface GodotExport {
  baseName: string;
  layout: SheetLayout;
  sheet: PixelRegion;
  animations: GodotAnimation[];
  /** File name → content, relative to resDir. The PNG is `${baseName}.png` (encode `sheet`). */
  files: { name: string; text: string }[];
  pngName: string;
}

/** "Knight Walk!" → "knight_walk" (safe for res:// file names and node names). */
export function snakeName(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'sprite';
}

function pascalName(name: string): string {
  return snakeName(name)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** Godot floats always carry a decimal point. */
export function godotFloat(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}

function godotString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function joinRes(dir: string, file: string): string {
  const trimmed = dir.replace(/\/+$/, '');
  // Keep the project root "res://" intact.
  return trimmed.endsWith(':') ? `${trimmed}//${file}` : `${trimmed}/${file}`;
}

/**
 * Converts per-frame milliseconds to Godot's (speed, relative duration) pair
 * exactly: speed = 1000 / shortest frame, so every relative duration is >= 1.
 */
export function godotTiming(msDurations: number[]): { speed: number; durations: number[] } {
  const base = Math.min(...msDurations);
  return {
    speed: Math.round((1000 / base) * 1000) / 1000,
    durations: msDurations.map((ms) => Math.round((ms / base) * 10000) / 10000),
  };
}

export function godotAnimations(doc: SpriteDocument): GodotAnimation[] {
  const sources = doc.tags.length
    ? doc.tags.map((t) => ({ name: t.name, frames: tagFrameSequence(t), loop: t.loop }))
    : [{ name: 'default', frames: doc.frames.map((_, i) => i), loop: true }];
  return sources.map((a) => {
    const timing = godotTiming(a.frames.map((i) => doc.frames[i].duration));
    return { ...a, ...timing };
  });
}

export function exportGodot(doc: SpriteDocument, opts: GodotExportOptions): GodotExport {
  const baseName = snakeName(opts.baseName ?? doc.name);
  const scale = Math.max(1, Math.floor(opts.scale ?? 1));
  const columns = opts.columns ?? Math.min(doc.frames.length, 16);
  const layout = layoutSpritesheet(doc, { columns, spacing: opts.spacing ?? 0 });
  const sheet = scaleRegion(renderSpritesheet(doc, layout), scale);
  const animations = godotAnimations(doc);

  const pngName = `${baseName}.png`;
  const tresName = `${baseName}.tres`;
  const sceneName = `${baseName}.tscn`;

  // One AtlasTexture per frame referenced by any animation, in frame order.
  const used = [...new Set(animations.flatMap((a) => a.frames))].sort((a, b) => a - b);
  const atlasId = (frame: number) => `AtlasTexture_f${frame}`;

  const lines: string[] = [];
  lines.push(`[gd_resource type="SpriteFrames" load_steps=${used.length + 2} format=3]`, '');
  lines.push(`[ext_resource type="Texture2D" path=${godotString(joinRes(opts.resDir, pngName))} id="1_sheet"]`, '');
  for (const frame of used) {
    const cell = layout.cells.find((c) => c.frameIndex === frame)!;
    lines.push(`[sub_resource type="AtlasTexture" id="${atlasId(frame)}"]`);
    lines.push('atlas = ExtResource("1_sheet")');
    lines.push(
      `region = Rect2(${cell.x * scale}, ${cell.y * scale}, ${layout.frameWidth * scale}, ${layout.frameHeight * scale})`,
      '',
    );
  }
  lines.push('[resource]');
  const anims = animations.map((a) => {
    const frames = a.frames
      .map((f, i) => `{\n"duration": ${godotFloat(a.durations[i])},\n"texture": SubResource("${atlasId(f)}")\n}`)
      .join(', ');
    return `{\n"frames": [${frames}],\n"loop": ${a.loop !== false},\n"name": &${godotString(a.name)},\n"speed": ${godotFloat(a.speed)}\n}`;
  });
  lines.push(`animations = [${anims.join(', ')}]`, '');

  const autoplay =
    (opts.autoplay && animations.find((a) => a.name === opts.autoplay)?.name) ??
    animations.find((a) => a.name === 'idle')?.name ??
    animations[0].name;

  const scene = [
    '[gd_scene load_steps=2 format=3]',
    '',
    `[ext_resource type="SpriteFrames" path=${godotString(joinRes(opts.resDir, tresName))} id="1_frames"]`,
    '',
    `[node name=${godotString(pascalName(doc.name))} type="AnimatedSprite2D"]`,
    'texture_filter = 1',
    'sprite_frames = ExtResource("1_frames")',
    `animation = &${godotString(autoplay)}`,
    `autoplay = ${godotString(autoplay)}`,
    '',
  ];

  return {
    baseName,
    layout,
    sheet,
    animations,
    pngName,
    files: [
      { name: tresName, text: lines.join('\n') },
      { name: sceneName, text: scene.join('\n') },
    ],
  };
}
