import { describe, expect, it } from 'vitest';
import {
  addFrame, addTag, createDocument, exportGodot, exportGodotTileset, setPixels, godotFloat, godotTiming, setFrameDuration, snakeName,
} from '../src';

function knight() {
  let d = createDocument({ name: 'Knight Hero', width: 16, height: 24 });
  for (let i = 0; i < 4; i++) d = addFrame(d).doc; // 5 frames
  d = setFrameDuration(d, d.frames[4].id, 300);
  d = addTag(d, { name: 'idle', from: 0, to: 1 }).doc;
  d = addTag(d, { name: 'attack', from: 2, to: 4, direction: 'pingpong', loop: false }).doc;
  return d;
}

describe('godot export', () => {
  it('names and numbers like Godot expects', () => {
    expect(snakeName('Knight Hero')).toBe('knight_hero');
    expect(snakeName('slimeBoss 2!')).toBe('slime_boss_2');
    expect(snakeName('Ñandú')).toBe('nandu');
    expect(snakeName('***')).toBe('sprite');
    expect(godotFloat(1)).toBe('1.0');
    expect(godotFloat(2.5)).toBe('2.5');
    expect(godotTiming([100, 100, 300])).toEqual({ speed: 10, durations: [1, 1, 3] });
    expect(godotTiming([150])).toEqual({ speed: 6.667, durations: [1] });
  });

  it('writes a SpriteFrames resource with atlas regions and animations', () => {
    const out = exportGodot(knight(), { resDir: 'res://sprites/knight/', columns: 3, spacing: 1 });
    expect(out.pngName).toBe('knight_hero.png');
    expect(out.sheet).toMatchObject({ width: 16 * 3 + 2, height: 24 * 2 + 1 });
    const tres = out.files.find((f) => f.name === 'knight_hero.tres')!.text;
    expect(tres.startsWith('[gd_resource type="SpriteFrames" load_steps=7 format=3]')).toBe(true);
    expect(tres).toContain('[ext_resource type="Texture2D" path="res://sprites/knight/knight_hero.png" id="1_sheet"]');
    // frame 4 is in row 1, column 1 with 1px spacing
    expect(tres).toContain('[sub_resource type="AtlasTexture" id="AtlasTexture_f4"]\natlas = ExtResource("1_sheet")\nregion = Rect2(17, 25, 16, 24)');
    expect(tres).toContain('"name": &"idle",\n"speed": 10.0');
    // pingpong 2,3,4 → 2,3,4,3 ; frame 4 lasts 300ms
    const attack = out.animations.find((a) => a.name === 'attack')!;
    expect(attack).toMatchObject({ frames: [2, 3, 4, 3], durations: [1, 1, 3, 1], speed: 10, loop: false });
    expect(tres).toContain('"loop": false,\n"name": &"attack"');
  });

  it('scales regions and builds an AnimatedSprite2D scene', () => {
    const out = exportGodot(knight(), { resDir: 'res://art', scale: 2, autoplay: 'attack' });
    const tres = out.files[0].text;
    expect(tres).toContain('region = Rect2(32, 0, 32, 48)');
    const scene = out.files.find((f) => f.name.endsWith('.tscn'))!.text;
    expect(scene).toContain('[ext_resource type="SpriteFrames" path="res://art/knight_hero.tres" id="1_frames"]');
    expect(scene).toContain('[node name="KnightHero" type="AnimatedSprite2D"]');
    expect(scene).toContain('texture_filter = 1');
    expect(scene).toContain('autoplay = "attack"');
  });

  it('exports all frames as "default" when there are no animations', () => {
    let d = createDocument({ name: 'coin', width: 8, height: 8 });
    d = addFrame(d).doc;
    const out = exportGodot(d, { resDir: 'res://' });
    expect(out.animations).toEqual([{ name: 'default', frames: [0, 1], durations: [1, 1], speed: 10, loop: true }]);
    expect(out.files[0].text).toContain('path="res://coin.png"');
    expect(out.files[1].text).toContain('autoplay = "default"');
  });
});

describe('godot tileset export', () => {
  it('registers only non-empty tiles', () => {
    let d = createDocument({ name: 'Dungeon Tiles', width: 32, height: 16 });
    d = setPixels(d, d.layers[0].id, d.frames[0].id, [{ x: 0, y: 0, color: 0xffffffff }, { x: 31, y: 15, color: 0xffffffff }]);
    const out = exportGodotTileset(d, { resDir: 'res://tiles', tileWidth: 8, tileHeight: 8 });
    expect(out).toMatchObject({ columns: 4, rows: 2, tiles: [{ x: 0, y: 0 }, { x: 3, y: 1 }], pngName: 'dungeon_tiles.png' });
    const tres = out.files[0];
    expect(tres.name).toBe('dungeon_tiles_tileset.tres');
    expect(tres.text).toContain('[ext_resource type="Texture2D" path="res://tiles/dungeon_tiles.png" id="1_atlas"]');
    expect(tres.text).toContain('texture_region_size = Vector2i(8, 8)\n0:0/0 = 0\n3:1/0 = 0\n');
    expect(tres.text).toContain('tile_size = Vector2i(8, 8)');
  });

  it('rejects canvas sizes that are not a multiple of the tile size', () => {
    expect(() => exportGodotTileset(createDocument({ width: 20, height: 16 }), { resDir: 'res://', tileWidth: 16, tileHeight: 16 })).toThrow(/multiple/);
  });
});
