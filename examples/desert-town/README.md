# Example: desert town

A small asset set in the style of top-down pixel art RPGs like *Soulbound*: warm sand, beige stone,
red cloth and purple shadows. It was drawn entirely through the MCP tools (`create_sprite`,
`add_layer`, `update_layer`, `draw_grid`, `add_frame`, `create_animation`,
`save_sprite`), the way Claude would do it.

![The scene in the editor](editor-desert_town.png)

![Desert town scene (4×)](desert_town-x4.png)

<p>
  <img src="wanderer.gif" alt="Wanderer walk cycle" height="256">
  <img src="windmill.gif" alt="Spinning windmill" height="192">
  <img src="lantern.gif" alt="Flickering lantern" height="120">
</p>

| File | Contents |
|---|---|
| `desert_tiles.epx.json` | 64×64 tileset of 16×16 tiles: sand (plain, cracked, dunes, pebbles), cobblestone, cobble fading into sand, flagstones, wall top, wall face, wall base, stairs, dry bush, grass, rocks |
| `barrel.epx.json`, `crate.epx.json` | 16×20 barrel and 16×16 crate |
| `palm.epx.json` | 40×52 palm tree with its ground shadow |
| `lantern.epx.json` | 10×15 hanging lantern, `flicker` animation (2 frames) |
| `windmill.epx.json` | 24×32 windmill, `spin` animation (4 frames) |
| `wanderer.epx.json` | 16×32 hooded character: `idle` (2 frames) and `walk` (4 frames) |
| `desert_town.epx.json` | 192×128 scene built from the pieces above, one layer per depth: `suelo`, `muros`, `props`, `farolillos`, `personajes` |
| `*.png`, `*.gif` | Spritesheets and previews |

## Palette

38 colors in ramps, all of them in every file:

| Ramp | Colors |
|---|---|
| Outlines and purple shadows | `241527` `3b2437` `573452` `7a4a68` |
| Sand | `8f5650` `b9785f` `d99c6e` `ebb985` `f6d6a4` `fcefd0` |
| Stone | `6e4f5e` `9c7575` `c49d8c` `dfc0a4` `f1ddc2` |
| Red cloth | `5c1f33` `8c2f40` `bf4848` `e2785a` |
| Metal | `34345c` `52578a` `7c84b6` `b4bce0` |
| Wood | `45262c` `74402f` `a5633e` `cf8f55` |
| Green | `1f3a33` `33633e` `5f9445` `a3c35a` |
| Lamp, skin, accents | `f0a83c` `ffe58f` `d58e6c` `f2c19c` `3d86a8` `8fd3e2` `fff8ec` |

Outlines use the darkest color of each ramp instead of black, and shadows lean purple rather than
grey. That is most of what gives the style its warmth.

## Lighting

In the reference game most of the mood (sunset glow, night blues, lamp bloom) comes from the
engine. To preview it inside the editor, the scene has two extra layers:

- `luz` (35% opacity): dithered warm halos around the lanterns.
- `tinte atardecer` (18% opacity): a flat orange layer over everything.

Hide them to get the neutral daylight colors. In Godot, use `CanvasModulate`, `PointLight2D` and a
`WorldEnvironment` with glow instead, so the same sprites work by day and by night.
