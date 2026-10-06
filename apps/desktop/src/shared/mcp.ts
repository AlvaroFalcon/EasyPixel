/**
 * MCP tool catalogue shared by the Electron main process (which serves MCP and
 * validates arguments with these zod schemas) and the renderer (which executes
 * the tools against the editor store, so edits show up live and can be undone).
 */
import { z } from 'zod';
import type { McpCall as BaseCall } from './mcpTypes';

export * from './mcpTypes';

// ---------------------------------------------------------------------------
// Reusable argument schemas
// ---------------------------------------------------------------------------

const spriteId = z.string().optional().describe('Target sprite id from get_editor_state. Defaults to the active sprite.');
const layer = z
  .union([z.string(), z.number().int()])
  .optional()
  .describe('Layer name, id or 0-based index (0 = bottom). Defaults to the active layer.');
const frame = z.number().int().min(0).optional().describe('0-based frame index. Defaults to the active frame.');
const color = z
  .union([z.string(), z.number().int().min(0)])
  .describe('Hex color "#rrggbb" / "#rrggbbaa", a palette index, or "transparent".');
const point = z.object({ x: z.number().int(), y: z.number().int() });
const scale = z
  .number()
  .int()
  .min(1)
  .max(32)
  .optional()
  .describe('Integer upscale factor. Default: as large as possible up to ~512px.');
const background = z
  .string()
  .optional()
  .describe('Background behind transparent pixels: hex color or "transparent". Default "#ffffff".');

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

interface ToolSpec {
  title: string;
  description: string;
  input: z.ZodRawShape;
  readOnly?: boolean;
  destructive?: boolean;
}

export const TOOLS = {
  get_editor_state: {
    title: 'Get editor state',
    description:
      'Lists open sprites and describes the active one: size, palette (index, grid char, color), layers, frames (duration, which layers have pixels) and animations. Call this first.',
    input: { sprite_id: spriteId },
    readOnly: true,
  },
  create_sprite: {
    title: 'Create sprite',
    description:
      'Creates a new sprite in a new editor tab and makes it active. Typical sizes: 16x16, 32x32, 48x48, 64x64. Palette: a list of hex colors or a preset name (pico-8, sweetie-16, endesga-32, gameboy, 1bit).',
    input: {
      name: z.string().min(1).describe('Sprite name, e.g. "knight". Used for file names when exporting.'),
      width: z.number().int().min(1).max(1024),
      height: z.number().int().min(1).max(1024),
      palette: z.union([z.array(z.string()), z.string()]).optional(),
    },
  },
  select_sprite: {
    title: 'Select sprite',
    description: 'Switches the editor to another open sprite (tab).',
    input: { sprite_id: z.string() },
  },
  set_palette: {
    title: 'Set palette',
    description:
      'Replaces (or appends to) the sprite palette. Grid characters map to palette indices: 0-9 then a-z then A-Z. Keep palettes small (4-32 colors) for a cohesive pixel art look.',
    input: {
      sprite_id: spriteId,
      colors: z.array(z.string()).min(1).describe('Hex colors, e.g. ["#1a1c2c", "#5d275d"].'),
      mode: z.enum(['replace', 'append']).optional().describe('Default "replace".'),
    },
  },
  draw_grid: {
    title: 'Draw grid',
    description: [
      'Paints pixels from a text grid: one string per row, one character per pixel.',
      'Without a legend each character is a palette index (0-9, then a-z, then A-Z) and "." is transparent.',
      'With a legend, characters map to hex colors or palette indices, e.g. {"o": "#222034", "s": 3}.',
      'This is the most efficient way to draw: send a whole frame (or a region using x/y) in one call.',
      'transparent="erase" (default) clears pixels under "."; "skip" leaves them untouched (useful to overlay details).',
    ].join(' '),
    input: {
      sprite_id: spriteId,
      rows: z.array(z.string()).min(1),
      legend: z.record(z.string(), z.union([z.string(), z.number().int()])).optional(),
      x: z.number().int().optional().describe('Left of the grid on the canvas. Default 0.'),
      y: z.number().int().optional().describe('Top of the grid on the canvas. Default 0.'),
      transparent: z.enum(['erase', 'skip']).optional(),
      frame,
      layer,
    },
  },
  draw_pixels: {
    title: 'Draw pixels',
    description: 'Sets individual pixels. Prefer draw_grid for more than a handful of pixels.',
    input: {
      sprite_id: spriteId,
      pixels: z.array(z.object({ x: z.number().int(), y: z.number().int(), color })).min(1),
      frame,
      layer,
    },
  },
  draw_shape: {
    title: 'Draw shape',
    description: 'Draws a pixel-perfect line, rectangle or ellipse between two corner points (inclusive).',
    input: {
      sprite_id: spriteId,
      shape: z.enum(['line', 'rect', 'ellipse']),
      from: point,
      to: point,
      color,
      filled: z.boolean().optional().describe('Fill rect/ellipse. Default false (outline).'),
      frame,
      layer,
    },
  },
  fill: {
    title: 'Bucket fill',
    description: 'Flood-fills the area of identical color starting at (x, y) on one layer.',
    input: {
      sprite_id: spriteId,
      x: z.number().int(),
      y: z.number().int(),
      color,
      contiguous: z.boolean().optional().describe('Only connected pixels (default true); false = every pixel of that color.'),
      frame,
      layer,
    },
  },
  clear: {
    title: 'Clear',
    description: 'Makes a layer transparent in one frame, or only inside a rectangle.',
    input: {
      sprite_id: spriteId,
      rect: z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(1), height: z.number().int().min(1) }).optional(),
      frame,
      layer,
    },
    destructive: true,
  },
  transform: {
    title: 'Transform layer',
    description: 'Flips or shifts the pixels of one layer in one frame (e.g. shift up 1px for a bob animation).',
    input: {
      sprite_id: spriteId,
      operation: z.enum(['flip_horizontal', 'flip_vertical', 'shift']),
      dx: z.number().int().optional(),
      dy: z.number().int().optional(),
      wrap: z.boolean().optional().describe('For shift: wrap pixels around the edges. Default false.'),
      frame,
      layer,
    },
  },
  replace_color: {
    title: 'Replace color',
    description: 'Replaces every pixel of one exact color with another in all layers and frames (palette swaps, recolors).',
    input: { sprite_id: spriteId, from: color, to: color },
  },
  add_layer: {
    title: 'Add layer',
    description:
      'Adds a layer and makes it active. Common setup: "outline", "color", "shading", "details". Layers are composited bottom to top.',
    input: {
      sprite_id: spriteId,
      name: z.string().min(1),
      position: z.enum(['above_active', 'top', 'bottom']).optional().describe('Default "top".'),
    },
  },
  update_layer: {
    title: 'Update layer',
    description: 'Renames a layer or changes visibility, opacity (0-1) or lock.',
    input: {
      sprite_id: spriteId,
      layer: z.union([z.string(), z.number().int()]),
      name: z.string().min(1).optional(),
      visible: z.boolean().optional(),
      opacity: z.number().min(0).max(1).optional(),
      locked: z.boolean().optional(),
    },
  },
  delete_layer: {
    title: 'Delete layer',
    description: 'Deletes a layer and its pixels in every frame.',
    input: { sprite_id: spriteId, layer: z.union([z.string(), z.number().int()]) },
    destructive: true,
  },
  add_frame: {
    title: 'Add frame',
    description:
      'Inserts a frame after `after` (default: last frame) and makes it active. With duplicate=true it copies all layers of that frame, the usual way to start the next animation pose.',
    input: {
      sprite_id: spriteId,
      after: z.number().int().min(0).optional(),
      duplicate: z.boolean().optional(),
      duration_ms: z.number().int().min(1).optional(),
    },
  },
  delete_frame: {
    title: 'Delete frame',
    description: 'Deletes a frame (all layers). Animations are adjusted.',
    input: { sprite_id: spriteId, frame: z.number().int().min(0) },
    destructive: true,
  },
  set_frame_duration: {
    title: 'Set frame duration',
    description: 'Sets how long frames are shown, in milliseconds (100 ms = 10 fps).',
    input: {
      sprite_id: spriteId,
      duration_ms: z.number().int().min(1),
      frames: z.array(z.number().int().min(0)).optional().describe('0-based frame indices. Default: all frames.'),
    },
  },
  create_animation: {
    title: 'Create animation',
    description:
      'Names a range of frames as an animation (e.g. idle, walk, run, jump, attack, hurt, death). These become animations in the Godot SpriteFrames export.',
    input: {
      sprite_id: spriteId,
      name: z.string().min(1),
      from: z.number().int().min(0).describe('First frame (0-based, inclusive).'),
      to: z.number().int().min(0).describe('Last frame (0-based, inclusive).'),
      direction: z.enum(['forward', 'reverse', 'pingpong']).optional(),
      loop: z.boolean().optional().describe('Default true. Use false for one-shot animations like attack or death.'),
    },
  },
  update_animation: {
    title: 'Update animation',
    description: 'Changes an existing animation (found by name).',
    input: {
      sprite_id: spriteId,
      name: z.string(),
      new_name: z.string().min(1).optional(),
      from: z.number().int().min(0).optional(),
      to: z.number().int().min(0).optional(),
      direction: z.enum(['forward', 'reverse', 'pingpong']).optional(),
      loop: z.boolean().optional(),
    },
  },
  delete_animation: {
    title: 'Delete animation',
    description: 'Removes an animation (the frames are kept).',
    input: { sprite_id: spriteId, name: z.string() },
    destructive: true,
  },
  get_frame_image: {
    title: 'View frame',
    description:
      'Returns a PNG of a frame (all visible layers, or one layer) scaled up with nearest neighbour, optionally with a pixel grid (major lines every 8px) to help count coordinates. Use it to check your work after drawing.',
    input: {
      sprite_id: spriteId,
      frame,
      layer: z.union([z.string(), z.number().int()]).optional().describe('Only this layer. Default: all visible layers.'),
      scale,
      grid: z.boolean().optional().describe('Overlay a pixel grid. Default true.'),
      background,
    },
    readOnly: true,
  },
  get_spritesheet_image: {
    title: 'View spritesheet',
    description: 'Returns a PNG with frames side by side (all frames, or one animation) to review an animation at a glance.',
    input: {
      sprite_id: spriteId,
      animation: z.string().optional().describe('Animation name. Default: all frames.'),
      columns: z.number().int().min(1).optional(),
      scale,
      background,
    },
    readOnly: true,
  },
  get_frame_grid: {
    title: 'Read frame as grid',
    description:
      'Returns the pixels of a frame (or one layer) as a text grid in the same format draw_grid accepts, with a legend. Useful to edit existing art precisely.',
    input: { sprite_id: spriteId, frame, layer: z.union([z.string(), z.number().int()]).optional() },
    readOnly: true,
  },
  undo: {
    title: 'Undo',
    description: 'Undoes the last editor change(s) — the user can also undo with Ctrl+Z.',
    input: { sprite_id: spriteId, steps: z.number().int().min(1).max(50).optional() },
  },
  save_sprite: {
    title: 'Save sprite',
    description:
      'Saves the sprite as an EasyPixel project (.epx.json). Without `path` it saves to its current file; pass an absolute path ending in .epx.json to choose where.',
    input: { sprite_id: spriteId, path: z.string().optional() },
  },
} satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOLS;
export type McpToolCall = BaseCall & { tool: ToolName };
export type ToolArgs<N extends ToolName> = z.infer<z.ZodObject<(typeof TOOLS)[N]['input']>>;

// ---------------------------------------------------------------------------
// Server instructions & prompt
// ---------------------------------------------------------------------------

export const SERVER_INSTRUCTIONS = `EasyPixel is a pixel art editor open on the user's computer. Every change you make appears live in the editor and can be undone by the user (Ctrl+Z).

Conventions
- Coordinates: x grows right, y grows down, (0,0) is the top-left pixel. Frames and layers are 0-based (the UI shows frames 1-based).
- Grid format (draw_grid / get_frame_grid): one string per row; without a legend each char is a palette index (0-9, a-z, A-Z) and "." is transparent.

Workflow
1. get_editor_state (or create_sprite) to know the canvas size, palette and layers.
2. set_palette with a small, harmonious palette (4-32 colors), including a dark outline color (not pure black), 2-3 shades per material and a highlight.
3. Draw each frame with draw_grid (full frame rows of exactly 'width' chars). Use layers when helpful (e.g. "outline", "color", "shading").
4. ALWAYS call get_frame_image after drawing and fix problems you see before moving on.
5. For animations: add_frame with duplicate=true, then modify the copy; keep the silhouette consistent; create_animation with Godot-friendly names (idle, walk, run, jump, attack, hurt, death) and appropriate frame durations.
6. Review with get_spritesheet_image.

Pixel art guidance: readable silhouette at 1x, consistent light source (top-left), 1px outlines, avoid pillow shading and orphan pixels, use hue shifting for shadows/highlights, leave transparent margins so animations do not clip.`;

export const PIXEL_ART_PROMPT = (subject: string, size: string, animations: string) =>
  `Create pixel art in EasyPixel: ${subject}.
Canvas: ${size}. Animations: ${animations || 'a single idle frame'}.

Follow the EasyPixel workflow: create the sprite, choose a limited palette, draw the base frame with draw_grid, check it with get_frame_image and refine it until it reads well at 1x. Then build each animation by duplicating frames and editing them, name the frame ranges with create_animation and review the result with get_spritesheet_image. Explain briefly what you drew when you finish.`;
