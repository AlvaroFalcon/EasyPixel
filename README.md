# EasyPixel

Editor de pixel art para sprites y spritesheets de videojuegos, hecho con **React + TypeScript**
sobre **Electron**. Pensado para trabajar junto a **Claude vía MCP** (próxima fase) y exportar
directamente a **Godot 4**.

> Plan completo y fases: [`docs/PLAN.md`](docs/PLAN.md)

## Estado

| Fase | Estado |
|---|---|
| 1. Base: modelo de documento, operaciones, historial, tests | ✅ |
| 2. Editor: lienzo, herramientas, paleta, capas, frames, guardar/abrir | ✅ |
| 3. Animación: tags, onion skin, previsualización | ✅ |
| 4. Servidor MCP para Claude | ✅ |
| 5. Exportación Godot (`SpriteFrames.tres`) | ✅ |

## Requisitos

- Node.js 20+ (probado con Node 22) y npm 10+

## Uso

```bash
npm install          # instala dependencias (descarga Electron)
npm run dev          # abre la app de escritorio con recarga en caliente
npm run dev:web      # solo la interfaz en el navegador: http://localhost:5173
npm run build        # compila main, preload y renderer en apps/desktop/out
```

Calidad:

```bash
npm test             # tests unitarios (Vitest)
npm run typecheck    # TypeScript estricto en todos los paquetes
npm run test:e2e     # tests de interfaz en navegador (Playwright)
npm run test:electron  # integración real: app Electron + clientes MCP (HTTP y stdio) + export Godot
```

## Estructura

```
packages/core        Lógica pura en TS (sin DOM): modelo, dibujo, capas, frames,
                     paletas, composición, spritesheets, formato .epx.json, historial
apps/desktop
  src/main           Proceso principal de Electron (ventana, diálogos de archivo)
  src/preload        Puente seguro window.easypixel (contextIsolation + sandbox)
  src/renderer       Interfaz React (store con Zustand, lienzo Canvas 2D)
e2e                  Tests de interfaz con Playwright
```

El documento es **inmutable**: cada edición crea un documento nuevo que comparte los datos
no modificados con el anterior. Así deshacer/rehacer es trivial y funcionará igual para las
ediciones que haga Claude (el historial guarda el origen de cada cambio).

## Atajos

| Tecla | Acción | Tecla | Acción |
|---|---|---|---|
| `B` | Lápiz | `X` | Intercambiar colores |
| `E` | Borrador | `[` / `]` | Tamaño de pincel |
| `G` | Cubo de relleno | `,` / `.` | Frame anterior / siguiente |
| `L` | Línea (`Shift` = 45°) | `+` / `-` / `0` | Zoom / ajustar |
| `U` | Rectángulo (`Shift` = cuadrado) | `Espacio` + arrastrar | Mover vista |
| `O` | Elipse (`Shift` = círculo) | `Alt` + clic | Cuentagotas rápido |
| `I` | Cuentagotas | `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `M` | Selección | `Ctrl+C/X/V` | Copiar / cortar / pegar |
| `H` | Mano | `Supr` | Borrar selección |
| `Ctrl+S` | Guardar | `Intro` / `Esc` | Fijar / cancelar selección flotante |
| `Ctrl+O` | Abrir | `Ctrl+G` | Rejilla |
| `P` | Reproducir / pausar animación | `Mayús`+clic en frame | Seleccionar rango de frames |
| `Ctrl+Shift+E` | Re-exportar a Godot | | |
| `Ctrl+I` | Importar PNG | `Ctrl+E` | Exportar PNG |

Clic izquierdo dibuja con el color principal y clic derecho con el secundario.
Por defecto el secundario es transparente, así que el clic derecho borra.

## Exportar a Godot 4

**Archivo → Exportar a Godot…** y elige una carpeta dentro de tu proyecto (EasyPixel busca
`project.godot` hacia arriba y calcula la ruta `res://`). Se generan tres archivos:

| Archivo | Para qué |
|---|---|
| `<nombre>.png` | Spritesheet en rejilla (columnas, separación y escala configurables). Vale también para `Sprite2D` con `hframes`/`vframes`. |
| `<nombre>.tres` | `SpriteFrames` con un `AtlasTexture` por frame y **una animación por cada animación de EasyPixel**: velocidad y duración relativa calculadas a partir de los ms de cada frame, bucle respetado y ping-pong/reversa expandidos (Godot solo reproduce hacia delante). Sin animaciones se exporta `default`. |
| `<nombre>.tscn` | Escena `AnimatedSprite2D` lista para instanciar: `texture_filter = Nearest` y `autoplay` (por defecto `idle`). |

Los ajustes se guardan en el `.epx.json`, así que después basta con **Ctrl+Shift+E** para
re-exportar (Godot reimporta los cambios automáticamente). Claude puede hacer lo mismo con la
herramienta MCP `export_godot`.

Consejos para pixel art en Godot: en *Project Settings → Rendering → Textures* pon
*Default Texture Filter* en **Nearest** (la escena exportada ya lo fuerza en su nodo) y usa
*Display → Window → Stretch* con modo `viewport` o `canvas_items` y escala entera.

> Validado con Godot 4.5.1: `npm run test:electron` con `GODOT_BIN=/ruta/a/godot` importa y carga
> los recursos exportados en un Godot real (headless).

## Dibujar con Claude (MCP)

Al abrir EasyPixel se inicia un servidor MCP local en `http://127.0.0.1:7777/mcp`
(solo accesible desde tu equipo). El menú **Claude → Conectar con Claude…** muestra la
configuración exacta para tu instalación, con botón de copiar.

**Claude Code** (una sola vez):

```bash
claude mcp add --transport http easypixel http://127.0.0.1:7777/mcp
```

**Claude Desktop**: añade a `claude_desktop_config.json` (Ajustes → Desarrollador → Editar
configuración) el bloque que muestra el diálogo. Usa un pequeño puente stdio que se ejecuta con el
propio binario de EasyPixel/Electron, así que no necesitas Node instalado:

```json
{
  "mcpServers": {
    "easypixel": {
      "command": "<ruta a Electron/EasyPixel>",
      "args": ["<ruta>/apps/desktop/out/main/mcp-bridge.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

Luego pídele, por ejemplo: *«Dibuja en EasyPixel un caballero de 32×32 con paleta Endesga 32 y
crea una animación idle de 4 frames»*.

- Lo que dibuja Claude aparece **en directo**; cada acción es un paso del historial marcado con ✦
  y puedes deshacerlo con `Ctrl+Z`.
- Si Claude crea un sprite, se abre en **una pestaña nueva**: nunca pisa tu trabajo.
- El indicador **MCP** de la barra de estado muestra si el servidor está activo y qué está
  haciendo Claude.
- Puerto configurable con la variable `EASYPIXEL_MCP_PORT`.

Herramientas disponibles:

| Grupo | Herramientas |
|---|---|
| Sprites | `get_editor_state`, `create_sprite`, `select_sprite`, `save_sprite` |
| Paleta | `set_palette`, `replace_color` |
| Dibujo | `draw_grid` (frame completo como texto), `draw_pixels`, `draw_shape`, `fill`, `clear`, `transform` |
| Capas | `add_layer`, `update_layer`, `delete_layer` |
| Frames y animaciones | `add_frame`, `delete_frame`, `set_frame_duration`, `create_animation`, `update_animation`, `delete_animation` |
| Revisión | `get_frame_image` (PNG ampliado con rejilla), `get_spritesheet_image`, `get_frame_grid`, `undo` |
| Godot | `export_godot` (PNG + `SpriteFrames.tres` + escena `.tscn` en tu proyecto) |

Además expone el prompt `pixel_art_sprite` (flujo guiado) e instrucciones de servidor con las
convenciones (coordenadas, formato de rejilla) y consejos de pixel art.

## Animaciones

- Selecciona un rango de frames con **Mayús+clic** en el timeline y pulsa **+ Nueva animación**
  (`idle`, `walk`, `run`…). Cada animación tiene dirección (adelante, atrás, ping-pong) y bucle.
- Las animaciones aparecen como barras de color sobre los frames: clic para seleccionarla
  (la vista previa la reproduce), doble clic para editarla.
- La duración se define por frame (ms), igual que en Aseprite; al exportar a Godot se convertirá
  a velocidad + duración relativa de `SpriteFrames`.
- **Papel cebolla**: muestra los frames vecinos (rojo = anterior, azul = siguiente).

## Formato `.epx.json`

JSON legible (capas, frames, tags de animación, paleta en hex y píxeles RGBA en base64 por
*cel*), apto para git y fácil de leer para Claude.
