# Ejemplo: slime animado

Generado por EasyPixel desde un cliente MCP (como lo haría Claude): `create_sprite`, un
`draw_grid` por frame, `create_animation` y `export_godot`. Validado en Godot 4.5.1.

| Archivo | Contenido |
|---|---|
| `slime.epx.json` | Proyecto editable de EasyPixel (ábrelo con Archivo → Abrir) |
| `slime.png` | Spritesheet 216×24: 9 frames de 24×24 en una fila (`hframes=9`) |
| `slime.tres` | `SpriteFrames`: `idle` (frames 0–3, 160 ms, bucle) y `jump` (frames 4–8, sin bucle) |
| `slime.tscn` | `AnimatedSprite2D` con filtro Nearest y autoplay `idle` |
| `slime.gif` | Vista previa (×8), montada a partir de `slime.png` |

Las rutas del `.tres`/`.tscn` apuntan a `res://sprites/slime/`: copia la carpeta ahí en tu proyecto
(o reexporta desde EasyPixel a la carpeta que quieras).
