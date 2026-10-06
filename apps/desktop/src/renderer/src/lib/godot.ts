import { exportGodot, exportGodotTileset, type GodotExportSettings, type SpriteDocument } from '@easypixel/core';
import { encodePng } from './image';
import { godotProject, isElectron, writeFiles } from './platform';

export interface GodotExportResult {
  written: string[];
  resDir: string;
  /** For Sprite2D users: hframes / vframes of the sheet. */
  hframes: number;
  vframes: number;
  animations: string[];
  /** TileSet mode: number of tiles registered. */
  tiles?: number;
}

export class NotAGodotProjectError extends Error {
  constructor(dir: string) {
    super(`"${dir}" is not inside a Godot project (no project.godot found in it or its parents).`);
  }
}

/**
 * Writes <name>.png (spritesheet), <name>.tres (SpriteFrames) and <name>.tscn
 * (AnimatedSprite2D) into `settings.dir`, with res:// paths computed from the
 * enclosing Godot project. In the browser build the files are downloaded and
 * assumed to live at the project root.
 */
export async function exportToGodot(doc: SpriteDocument, settings: GodotExportSettings): Promise<GodotExportResult> {
  let resDir = 'res://';
  if (isElectron) {
    const project = await godotProject(settings.dir);
    if (!project) throw new NotAGodotProjectError(settings.dir);
    resDir = project.resDir;
  }
  if (settings.mode === 'tileset') {
    const out = exportGodotTileset(doc, { resDir, tileWidth: settings.tileWidth ?? 16, tileHeight: settings.tileHeight ?? 16 });
    const written = await writeFiles(settings.dir, [
      { name: out.pngName, data: await encodePng(out.image) },
      ...out.files.map((f) => ({ name: f.name, data: f.text })),
    ]);
    return { written, resDir, hframes: out.columns, vframes: out.rows, animations: [], tiles: out.tiles.length };
  }
  const out = exportGodot(doc, {
    resDir,
    columns: settings.columns,
    spacing: settings.spacing,
    scale: settings.scale,
    autoplay: settings.autoplay,
  });
  const png = await encodePng(out.sheet);
  const written = await writeFiles(settings.dir, [
    { name: out.pngName, data: png },
    ...out.files.map((f) => ({ name: f.name, data: f.text })),
  ]);
  return {
    written,
    resDir,
    hframes: out.layout.columns,
    vframes: out.layout.rows,
    animations: out.animations.map((a) => a.name),
  };
}
