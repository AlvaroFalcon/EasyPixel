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
| 4. Servidor MCP para Claude | ⏳ |
| 5. Exportación Godot (`SpriteFrames.tres`) | ⏳ |

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
| `Ctrl+I` | Importar PNG | `Ctrl+E` | Exportar PNG |

Clic izquierdo dibuja con el color principal y clic derecho con el secundario.
Por defecto el secundario es transparente, así que el clic derecho borra.

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
