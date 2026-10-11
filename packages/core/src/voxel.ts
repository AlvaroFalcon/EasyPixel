/**
 * Voxel export: turns pixel art into a 3D voxel model and writes it as
 * MagicaVoxel .vox (the de-facto voxel format) or binary glTF .glb (imported
 * natively by Godot 4, Blender and Unity).
 *
 * Coordinates follow glTF: +X right, +Y up, +Z towards the viewer.
 */
import { compositeFrame } from './composite';
import { celKey, type CelData, type SpriteDocument } from './document';

/** Packed 0xRRGGBBAA per voxel; 0 = empty. Index = x + sizeX * (y + sizeY * z). */
export interface VoxelModel {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  voxels: Uint32Array;
}

/**
 * - extrude: the frame becomes a slab `depth` voxels thick.
 * - inflate: thickness grows towards the inside of the shape (rounded, "puffy" look), up to `depth`.
 * - layers: every visible layer is a slab of its own (bottom layer at the back): 2.5D dioramas.
 * - slices: every frame is a horizontal slice stacked upwards (sprite stacking): real 3D models
 *   drawn as top-down slices, frame 0 at the bottom.
 */
export type VoxelMode = 'extrude' | 'inflate' | 'layers' | 'slices';

export interface VoxelOptions {
  mode: VoxelMode;
  /** Thickness in voxels (extrude/inflate max/each layer/each slice). Default 1. */
  depth?: number;
  /** Frame used by extrude/inflate/layers. Default 0. */
  frame?: number;
  /** Trim empty margins so the base of the model sits on the ground (default true). */
  crop?: boolean;
}

export const MAX_VOXEL_COUNT = 16_000_000;

function packOpaque(d: Uint8ClampedArray, i: number): number {
  return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | 255) >>> 0;
}

function emptyModel(sizeX: number, sizeY: number, sizeZ: number): VoxelModel {
  if (sizeX < 1 || sizeY < 1 || sizeZ < 1) throw new Error('The voxel model would be empty');
  if (sizeX * sizeY * sizeZ > MAX_VOXEL_COUNT) {
    throw new Error(`The voxel model would be too big (${sizeX}×${sizeY}×${sizeZ}); reduce the depth or the canvas size`);
  }
  return { sizeX, sizeY, sizeZ, voxels: new Uint32Array(sizeX * sizeY * sizeZ) };
}

export function voxelIndex(m: VoxelModel, x: number, y: number, z: number): number {
  return x + m.sizeX * (y + m.sizeY * z);
}

export function getVoxel(m: VoxelModel, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= m.sizeX || y >= m.sizeY || z >= m.sizeZ) return 0;
  return m.voxels[voxelIndex(m, x, y, z)];
}

/** Distance (in pixels, 4-neighbour) from each opaque pixel to the outside of the shape: edge pixels are 1. */
function insideDistance(data: Uint8ClampedArray, w: number, h: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= 128;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!opaque(x, y)) continue;
      if (!opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) {
        dist[y * w + x] = 1;
        queue.push(y * w + x);
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!opaque(nx, ny)) continue;
      const n = ny * w + nx;
      if (dist[n] !== -1) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }
  return dist;
}

export function documentToVoxels(doc: SpriteDocument, opts: VoxelOptions): VoxelModel {
  const model = buildVoxels(doc, opts);
  return opts.crop === false ? model : cropVoxels(model);
}

function buildVoxels(doc: SpriteDocument, opts: VoxelOptions): VoxelModel {
  const depth = Math.max(1, Math.floor(opts.depth ?? 1));
  const frame = opts.frame ?? 0;
  if (!doc.frames[frame]) throw new Error(`Frame index out of range: ${frame}`);
  const { width: w, height: h } = doc;

  switch (opts.mode) {
    case 'extrude':
    case 'inflate': {
      const data = compositeFrame(doc, frame);
      const m = emptyModel(w, h, depth);
      const dist = opts.mode === 'inflate' ? insideDistance(data, w, h) : null;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const i = (py * w + px) * 4;
          if (data[i + 3] < 128) continue;
          const color = packOpaque(data, i);
          // Inflate: 1 voxel at the outline, +2 per pixel further inside, centred in depth.
          const thickness = dist ? Math.min(depth, 2 * dist[py * w + px] - 1) : depth;
          const z0 = Math.floor((depth - thickness) / 2);
          for (let z = z0; z < z0 + thickness; z++) m.voxels[voxelIndex(m, px, h - 1 - py, z)] = color;
        }
      }
      return m;
    }
    case 'layers': {
      const layers = doc.layers.filter((l) => l.visible);
      if (layers.length === 0) throw new Error('There are no visible layers');
      const m = emptyModel(w, h, layers.length * depth);
      const frameId = doc.frames[frame].id;
      layers.forEach((layer, li) => {
        const cel: CelData | undefined = doc.cels[celKey(layer.id, frameId)];
        if (!cel) return;
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const i = (py * w + px) * 4;
            if (cel[i + 3] < 128) continue;
            const color = packOpaque(cel, i);
            for (let z = li * depth; z < (li + 1) * depth; z++) m.voxels[voxelIndex(m, px, h - 1 - py, z)] = color;
          }
        }
      });
      return m;
    }
    case 'slices': {
      const n = doc.frames.length;
      // Top-down slices: image x → X, image y → Z (top row at the back), frame → Y (up).
      const m = emptyModel(w, n * depth, h);
      for (let f = 0; f < n; f++) {
        const data = compositeFrame(doc, f);
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const i = (py * w + px) * 4;
            if (data[i + 3] < 128) continue;
            const color = packOpaque(data, i);
            for (let y = f * depth; y < (f + 1) * depth; y++) m.voxels[voxelIndex(m, px, y, py)] = color;
          }
        }
      }
      return m;
    }
  }
}

/** Removes empty margins on every axis (so the model's base sits at y = 0). Empty models are returned as is. */
export function cropVoxels(m: VoxelModel): VoxelModel {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-1, -1, -1];
  for (let z = 0; z < m.sizeZ; z++)
    for (let y = 0; y < m.sizeY; y++)
      for (let x = 0; x < m.sizeX; x++) {
        if (!m.voxels[voxelIndex(m, x, y, z)]) continue;
        const p = [x, y, z];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], p[a]);
          hi[a] = Math.max(hi[a], p[a]);
        }
      }
  if (hi[0] < 0) return m;
  const out = emptyModel(hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1);
  for (let z = 0; z < out.sizeZ; z++)
    for (let y = 0; y < out.sizeY; y++)
      for (let x = 0; x < out.sizeX; x++) {
        out.voxels[voxelIndex(out, x, y, z)] = m.voxels[voxelIndex(m, x + lo[0], y + lo[1], z + lo[2])];
      }
  return out;
}

export function countVoxels(m: VoxelModel): number {
  let n = 0;
  for (let i = 0; i < m.voxels.length; i++) if (m.voxels[i]) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Meshing
// ---------------------------------------------------------------------------

export interface VoxelQuad {
  /** Four corners, counter-clockwise seen from outside (glTF front face). */
  corners: [number, number, number][];
  normal: [number, number, number];
  color: number;
}

/**
 * Greedy meshing: only faces between a voxel and empty space are kept, and
 * coplanar neighbouring faces of the same color are merged into rectangles.
 */
export function greedyMesh(m: VoxelModel): VoxelQuad[] {
  const dims = [m.sizeX, m.sizeY, m.sizeZ];
  const quads: VoxelQuad[] = [];
  const at = (p: number[]) => getVoxel(m, p[0], p[1], p[2]);

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const du = dims[u];
    const dv = dims[v];
    const maskColor = new Uint32Array(du * dv);
    const maskSign = new Int8Array(du * dv);
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;

    for (x[d] = -1; x[d] < dims[d]; ) {
      // Faces on the plane between slice x[d] and x[d] + 1.
      let n = 0;
      for (x[v] = 0; x[v] < dv; x[v]++) {
        for (x[u] = 0; x[u] < du; x[u]++, n++) {
          const a = x[d] >= 0 ? at(x) : 0;
          const b = x[d] < dims[d] - 1 ? at([x[0] + q[0], x[1] + q[1], x[2] + q[2]]) : 0;
          if (!a === !b) {
            maskSign[n] = 0;
          } else if (a) {
            maskSign[n] = 1;
            maskColor[n] = a;
          } else {
            maskSign[n] = -1;
            maskColor[n] = b;
          }
        }
      }
      x[d]++;

      n = 0;
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; ) {
          const sign = maskSign[n];
          if (!sign) {
            i++;
            n++;
            continue;
          }
          const color = maskColor[n];
          const same = (k: number) => maskSign[k] === sign && maskColor[k] === color;
          let width = 1;
          while (i + width < du && same(n + width)) width++;
          let height = 1;
          grow: for (; j + height < dv; height++) {
            for (let k = 0; k < width; k++) if (!same(n + k + height * du)) break grow;
          }

          const base = [0, 0, 0];
          base[d] = x[d];
          base[u] = i;
          base[v] = j;
          const eu = [0, 0, 0];
          eu[u] = width;
          const ev = [0, 0, 0];
          ev[v] = height;
          const p0 = base as [number, number, number];
          const p1: [number, number, number] = [base[0] + eu[0], base[1] + eu[1], base[2] + eu[2]];
          const p2: [number, number, number] = [p1[0] + ev[0], p1[1] + ev[1], p1[2] + ev[2]];
          const p3: [number, number, number] = [base[0] + ev[0], base[1] + ev[1], base[2] + ev[2]];
          const normal: [number, number, number] = [0, 0, 0];
          normal[d] = sign;
          // (u, v, d) is a cyclic permutation of the axes, so u × v = +d.
          quads.push({ corners: sign > 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1], normal, color });

          for (let l = 0; l < height; l++) for (let k = 0; k < width; k++) maskSign[n + k + l * du] = 0;
          i += width;
          n += width;
        }
      }
    }
  }
  return quads;
}

export interface VoxelMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** sRGB colors, RGBA 0..1 per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
  min: [number, number, number];
  max: [number, number, number];
}

export interface MeshOptions {
  /** Size of one voxel in output units (Godot: meters). Default 1/16. */
  voxelSize?: number;
  /** Put the origin at the bottom centre of the model (default true), handy for characters and props. */
  centerBottom?: boolean;
}

export function voxelMesh(m: VoxelModel, opts: MeshOptions = {}): VoxelMesh {
  const quads = greedyMesh(m);
  const s = opts.voxelSize ?? 1 / 16;
  const ox = opts.centerBottom === false ? 0 : m.sizeX / 2;
  const oz = opts.centerBottom === false ? 0 : m.sizeZ / 2;
  const positions = new Float32Array(quads.length * 12);
  const normals = new Float32Array(quads.length * 12);
  const colors = new Float32Array(quads.length * 16);
  const indices = new Uint32Array(quads.length * 6);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  quads.forEach((quad, qi) => {
    const r = ((quad.color >>> 24) & 255) / 255;
    const g = ((quad.color >>> 16) & 255) / 255;
    const b = ((quad.color >>> 8) & 255) / 255;
    quad.corners.forEach((c, k) => {
      const p = [(c[0] - ox) * s, c[1] * s, (c[2] - oz) * s];
      positions.set(p, qi * 12 + k * 3);
      normals.set(quad.normal, qi * 12 + k * 3);
      colors.set([r, g, b, 1], qi * 16 + k * 4);
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p[a]);
        max[a] = Math.max(max[a], p[a]);
      }
    });
    const v = qi * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], qi * 6);
  });
  if (quads.length === 0) {
    min.fill(0);
    max.fill(0);
  }
  return { positions, normals, colors, indices, min, max };
}

// ---------------------------------------------------------------------------
// MagicaVoxel .vox
// ---------------------------------------------------------------------------

/**
 * MagicaVoxel .vox (version 150, one model): SIZE + XYZI + RGBA chunks.
 * MagicaVoxel is Z-up, so our Y (up) becomes its Z and our Z (towards the viewer) its -Y.
 * Limits: 256 voxels per axis and 255 colors (extra colors map to the nearest one).
 */
export function writeVox(m: VoxelModel): Uint8Array {
  if (m.sizeX > 256 || m.sizeY > 256 || m.sizeZ > 256) {
    throw new Error(`MagicaVoxel models are limited to 256 voxels per axis (this one is ${m.sizeX}×${m.sizeY}×${m.sizeZ}); export .glb instead`);
  }
  const counts = new Map<number, number>();
  const filled: number[] = [];
  for (let i = 0; i < m.voxels.length; i++) {
    const c = m.voxels[i];
    if (!c) continue;
    filled.push(i);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 255).map(([c]) => c);
  const exact = new Map(palette.map((c, i) => [c, i + 1]));
  const nearest = (c: number): number => {
    const hit = exact.get(c);
    if (hit) return hit;
    let best = 1;
    let bestD = Infinity;
    palette.forEach((p, i) => {
      const dr = ((p >>> 24) & 255) - ((c >>> 24) & 255);
      const dg = ((p >>> 16) & 255) - ((c >>> 16) & 255);
      const db = ((p >>> 8) & 255) - ((c >>> 8) & 255);
      const dd = dr * dr + dg * dg + db * db;
      if (dd < bestD) {
        bestD = dd;
        best = i + 1;
      }
    });
    exact.set(c, best);
    return best;
  };

  const xyzi = new Uint8Array(4 + filled.length * 4);
  const xyziView = new DataView(xyzi.buffer);
  xyziView.setInt32(0, filled.length, true);
  filled.forEach((index, k) => {
    const x = index % m.sizeX;
    const y = Math.floor(index / m.sizeX) % m.sizeY;
    const z = Math.floor(index / (m.sizeX * m.sizeY));
    xyzi.set([x, m.sizeZ - 1 - z, y, nearest(m.voxels[index])], 4 + k * 4);
  });

  const size = new Uint8Array(12);
  const sizeView = new DataView(size.buffer);
  sizeView.setInt32(0, m.sizeX, true);
  sizeView.setInt32(4, m.sizeZ, true);
  sizeView.setInt32(8, m.sizeY, true);

  const rgba = new Uint8Array(256 * 4);
  palette.forEach((c, i) => rgba.set([(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, 255], i * 4));

  const chunk = (id: string, content: Uint8Array, children = new Uint8Array(0)) => {
    const out = new Uint8Array(12 + content.length + children.length);
    const view = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
    view.setInt32(4, content.length, true);
    view.setInt32(8, children.length, true);
    out.set(content, 12);
    out.set(children, 12 + content.length);
    return out;
  };
  const children = [chunk('SIZE', size), chunk('XYZI', xyzi), chunk('RGBA', rgba)];
  const childBytes = new Uint8Array(children.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of children) {
    childBytes.set(c, offset);
    offset += c.length;
  }
  const main = chunk('MAIN', new Uint8Array(0), childBytes);
  const out = new Uint8Array(8 + main.length);
  out.set([0x56, 0x4f, 0x58, 0x20], 0); // "VOX "
  new DataView(out.buffer).setInt32(4, 150, true);
  out.set(main, 8);
  return out;
}

// ---------------------------------------------------------------------------
// glTF 2.0 binary (.glb)
// ---------------------------------------------------------------------------

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** UTF-8 encoding without depending on TextEncoder (core stays free of DOM/Node APIs). */
function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

const hex6 = (c: number) => (c >>> 8).toString(16).padStart(6, '0');

/**
 * Binary glTF 2.0: one mesh with one primitive (and one matte material) per
 * palette color. Colors live in the materials as floats, so they arrive exact
 * in Godot, Blender and Unity (Godot stores vertex colors as linear 8-bit,
 * which visibly shifts dark pixel-art colors). Godot 4 imports the file as a
 * scene with a MeshInstance3D.
 */
export function writeGlb(mesh: VoxelMesh, name = 'voxels'): Uint8Array {
  // Group the quads (4 vertices each, consecutive) by color.
  const quadCount = mesh.positions.length / 12;
  const byColor = new Map<string, number[]>();
  for (let q = 0; q < quadCount; q++) {
    const c = mesh.colors.subarray(q * 16, q * 16 + 3);
    const key = Array.from(c, (v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    let list = byColor.get(key);
    if (!list) byColor.set(key, (list = []));
    list.push(q);
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const addView = (data: Float32Array | Uint32Array, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, target });
    chunks.push(bytes);
    length += bytes.length; // 4-byte aligned: all data is 32-bit
    return bufferViews.length - 1;
  };

  const primitives: object[] = [];
  const materials: object[] = [];
  for (const [hex, quads] of byColor) {
    const positions = new Float32Array(quads.length * 12);
    const normals = new Float32Array(quads.length * 12);
    const indices = new Uint32Array(quads.length * 6);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    quads.forEach((q, k) => {
      positions.set(mesh.positions.subarray(q * 12, q * 12 + 12), k * 12);
      normals.set(mesh.normals.subarray(q * 12, q * 12 + 12), k * 12);
      indices.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
      for (let i = 0; i < 12; i++) {
        const a = i % 3;
        min[a] = Math.min(min[a], positions[k * 12 + i]);
        max[a] = Math.max(max[a], positions[k * 12 + i]);
      }
    });
    const pos = accessors.push({ bufferView: addView(positions, 34962), componentType: 5126, count: quads.length * 4, type: 'VEC3', min, max }) - 1;
    const nor = accessors.push({ bufferView: addView(normals, 34962), componentType: 5126, count: quads.length * 4, type: 'VEC3' }) - 1;
    const idx = accessors.push({ bufferView: addView(indices, 34963), componentType: 5125, count: indices.length, type: 'SCALAR' }) - 1;
    const rgb = [0, 2, 4].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
    materials.push({
      name: `color_${hex}`,
      pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 1 },
    });
    primitives.push({ attributes: { POSITION: pos, NORMAL: nor }, indices: idx, material: materials.length - 1, mode: 4 });
  }

  const bin = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bin.set(c, offset);
    offset += c.length;
  }

  const gltf = {
    asset: { version: '2.0', generator: 'EasyPixel' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }],
    materials,
    buffers: [{ byteLength: bin.length }],
    bufferViews,
    accessors,
  };

  let json = utf8(JSON.stringify(gltf));
  const jsonPad = (4 - (json.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(json.length + jsonPad).fill(0x20);
    padded.set(json);
    json = padded;
  }
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(json, 20);
  const binStart = 20 + json.length;
  view.setUint32(binStart, bin.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
  out.set(bin, binStart + 8);
  return out;
}

/** Unused-color-safe hex label for a packed color (used in UI summaries). */
export function voxelColorHex(c: number): string {
  return `#${hex6(c)}`;
}
