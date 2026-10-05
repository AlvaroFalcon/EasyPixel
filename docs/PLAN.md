# EasyPixel — Plan

Editor de pixel art (React + TypeScript) para sprites y spritesheets de un juego indie,
con un servidor MCP para que cualquier modelo de Claude pueda dibujar, y exportación
100% compatible con Godot 4.

## Decisiones

| Tema | Decisión |
|---|---|
| Plataforma | App de escritorio con **Electron** (UI React + Vite). El proceso principal (Node) aloja el servidor MCP y escribe directamente en el proyecto Godot. |
| Godot | Objetivo **Godot 4.x** (`format=3`). |
| Clientes Claude | Claude Desktop y Claude Code. MCP por HTTP local (`localhost`) + puente stdio. |
| Idioma | Código en inglés, interfaz en español con textos centralizados (i18n sencillo). |

## Arquitectura

```
Claude Desktop / Claude Code
        │  MCP (Streamable HTTP local o stdio vía puente)
        ▼
┌─ Electron main (Node) ──────────────────────────┐
│  Servidor MCP ──► DocumentStore (fuente de       │──► .png / .tres en el proyecto Godot
│                    verdad, historial undo/redo)  │
└──────────────┬───────────────────────────────────┘
               │ IPC (cambios en tiempo real)
┌──────────────▼──────────────┐
│ Renderer: React + TS + Vite │
└─────────────────────────────┘
packages/core: modelo, operaciones, composición, serialización, export Godot (TS puro)
```

* El documento es **inmutable**: cada edición produce un documento nuevo que comparte
  estructura con el anterior (copy-on-write por *cel*). El historial es una lista de
  documentos, así que deshacer/rehacer es trivial y sirve igual para ediciones del
  usuario y de Claude (cada entrada indica su origen).
* Toda la lógica (dibujo, capas, frames, paleta, composición, formato `.epx.json`)
  vive en `packages/core`, sin dependencias del DOM, para poder usarla en el renderer,
  en el servidor MCP y en tests.

## Funcionalidades

### Editor
- Lienzo con zoom/pan, rejilla de píxeles y fondo de transparencia.
- Herramientas: lápiz, borrador, cubo, línea, rectángulo, elipse, cuentagotas,
  selección rectangular + mover, dibujo en espejo X/Y.
- Paleta limitada editable con presets (PICO-8, Sweetie 16, Endesga 32, Game Boy)
  e importación `.gpl` / `.hex` (Lospec).
- Capas (visibilidad, opacidad, bloqueo, orden), frames, undo/redo.
- Tamaños predefinidos (16, 32, 64…) y libre. Redimensionar lienzo.
- Importar PNG / cortar spritesheets. Formato propio `.epx.json`.

### Animación
- Timeline de frames (añadir, duplicar, mover, borrar) con duración por frame.
- Animaciones con nombre (tags: `idle`, `walk`…), bucle, dirección.
- Onion skin, previsualización en bucle a 1×/2×/4×, vista de spritesheet.

### MCP (Claude)
- `create_sprite`, `list_sprites`, `get_sprite_info`, `set_palette`
- `set_pixels_grid` (frame como texto, 1 carácter = 1 índice de paleta), `draw_pixels`,
  `fill_rect`, `draw_line`, `draw_ellipse`, `flood_fill`, `clear`
- `add_layer`, `add_frame`, `duplicate_frame`, `transform_frame`
- `create_animation`, `set_frame_duration`
- `get_frame_image` / `get_spritesheet_image` (imagen PNG ampliada para que Claude vea
  su trabajo), `get_frame_grid`
- `export_godot`
- Prompt MCP con guía de estilo de pixel art.

### Godot 4
- Spritesheet PNG en rejilla (columnas, filas, margen, separación) → `Sprite2D` `hframes/vframes`.
- `SpriteFrames` `.tres` con `AtlasTexture` por frame y animaciones (velocidad, bucle,
  duración relativa) → `AnimatedSprite2D`.
- Opcional: `Animation` `.tres` para `AnimationPlayer`, `TileSet` atlas.
- Rutas `res://` correctas detectando `project.godot`; aviso de filtro `Nearest`.

## Fases

1. **Base** — monorepo, modelo de documento en `core`, comandos, undo/redo, tests. ✅
2. **Editor mínimo** — lienzo, herramientas, paleta, capas, frames, guardar/abrir `.epx.json`. ✅
3. **Animación** — timeline con tags, onion skin, panel de previsualización, vista de spritesheet.
4. **MCP** — servidor en Electron main, puente stdio, sincronización en vivo, feedback visual.
5. **Godot** — export PNG + `SpriteFrames.tres` a la carpeta del proyecto; import PNG/sheets.
6. **Extras** — TileSet, GIF, librería de paletas, imagen de referencia.
