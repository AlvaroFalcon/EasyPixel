import { describe, expect, it } from 'vitest';
import {
  addFrame, addLayer, countVoxels, createDocument, documentToVoxels, getVoxel, greedyMesh,
  setPixels, voxelMesh, writeGlb, writeVox, type VoxelModel,
} from '../src';

const RED = 0xff0000ff;
const BLUE = 0x0000ffff;

/** 4x4 sprite: a 2x3 red block plus one blue pixel. */
function sprite() {
  let d = createDocument({ width: 4, height: 4 });
  const L = d.layers[0].id;
  const F = d.frames[0].id;
  const pts = [];
  for (let y = 1; y < 4; y++) for (let x = 0; x < 2; x++) pts.push({ x, y, color: RED });
  pts.push({ x: 3, y: 0, color: BLUE });
  d = setPixels(d, L, F, pts);
  return d;
}

function exposedFaces(m: VoxelModel): number {
  let n = 0;
  for (let z = 0; z < m.sizeZ; z++)
    for (let y = 0; y < m.sizeY; y++)
      for (let x = 0; x < m.sizeX; x++) {
        if (!getVoxel(m, x, y, z)) continue;
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          if (!getVoxel(m, x + dx, y + dy, z + dz)) n++;
        }
      }
  return n;
}

function checkMesh(m: VoxelModel) {
  const quads = greedyMesh(m);
  let area = 0;
  for (const q of quads) {
    const [a, b, c] = q.corners;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    // Counter-clockwise from outside: the winding normal points the same way as the face normal.
    expect(Math.sign(cross[0])).toBe(q.normal[0]);
    expect(Math.sign(cross[1])).toBe(q.normal[1]);
    expect(Math.sign(cross[2])).toBe(q.normal[2]);
    area += Math.abs(cross[0] + cross[1] + cross[2]);
    // Every unit cell under the quad: solid voxel of that color behind, empty in front.
    const xs = q.corners.map((p) => p[0]), ys = q.corners.map((p) => p[1]), zs = q.corners.map((p) => p[2]);
    for (let x = Math.min(...xs); x < Math.max(...xs) || x === Math.min(...xs); x++)
      for (let y = Math.min(...ys); y < Math.max(...ys) || y === Math.min(...ys); y++)
        for (let z = Math.min(...zs); z < Math.max(...zs) || z === Math.min(...zs); z++) {
          const cell = [x, y, z].map((v, a) => (q.normal[a] === 0 ? v : v - (q.normal[a] > 0 ? 1 : 0)));
          const front = cell.map((v, a) => v + q.normal[a]);
          expect(getVoxel(m, cell[0], cell[1], cell[2])).toBe(q.color);
          expect(getVoxel(m, front[0], front[1], front[2])).toBe(0);
          if (q.normal[0] === 0 && x === Math.max(...xs)) break;
        }
  }
  expect(area).toBe(exposedFaces(m));
  return quads;
}

describe('voxel models', () => {
  it('extrudes a frame (y up, bottom row at y = 0)', () => {
    const m = documentToVoxels(sprite(), { mode: 'extrude', depth: 3, crop: false });
    expect([m.sizeX, m.sizeY, m.sizeZ]).toEqual([4, 4, 3]);
    expect(countVoxels(m)).toBe(7 * 3);
    expect(getVoxel(m, 3, 3, 1)).toBe(BLUE); // image (3, 0) is the top-right
    expect(getVoxel(m, 0, 0, 2)).toBe(RED);
  });

  it('inflates towards the inside of the shape', () => {
    let d = createDocument({ width: 5, height: 5 });
    const pts = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) pts.push({ x, y, color: RED });
    d = setPixels(d, d.layers[0].id, d.frames[0].id, pts);
    const m = documentToVoxels(d, { mode: 'inflate', depth: 5, crop: false });
    const column = (x: number, y: number) => [0, 1, 2, 3, 4].filter((z) => getVoxel(m, x, y, z)).length;
    expect(column(0, 0)).toBe(1); // outline
    expect(column(1, 1)).toBe(3);
    expect(column(2, 2)).toBe(5); // centre
    expect(getVoxel(m, 0, 0, 2)).toBe(RED); // centred in depth
  });

  it('turns layers into slabs and frames into stacked slices', () => {
    let d = sprite();
    const { doc, layer } = addLayer(d, 'front');
    d = setPixels(doc, layer.id, doc.frames[0].id, [{ x: 2, y: 2, color: BLUE }]);
    const layers = documentToVoxels(d, { mode: 'layers', depth: 2, crop: false });
    expect(layers.sizeZ).toBe(4);
    expect(getVoxel(layers, 2, 1, 3)).toBe(BLUE);
    expect(getVoxel(layers, 2, 1, 1)).toBe(0);

    d = addFrame(d).doc;
    d = setPixels(d, d.layers[0].id, d.frames[1].id, [{ x: 1, y: 0, color: BLUE }]);
    const slices = documentToVoxels(d, { mode: 'slices', depth: 1, crop: false });
    expect([slices.sizeX, slices.sizeY, slices.sizeZ]).toEqual([4, 2, 4]);
    expect(getVoxel(slices, 1, 1, 0)).toBe(BLUE); // frame 1 is one level up, image row 0 at the back
    expect(getVoxel(slices, 0, 0, 3)).toBe(RED);
  });

  it('crops empty margins by default', () => {
    let d = createDocument({ width: 8, height: 8 });
    d = setPixels(d, d.layers[0].id, d.frames[0].id, [{ x: 3, y: 2, color: RED }, { x: 4, y: 5, color: BLUE }]);
    const m = documentToVoxels(d, { mode: 'extrude', depth: 2 });
    expect([m.sizeX, m.sizeY, m.sizeZ]).toEqual([2, 4, 2]);
    expect(getVoxel(m, 1, 0, 0)).toBe(BLUE); // lowest pixel now at y = 0
    expect(getVoxel(m, 0, 3, 1)).toBe(RED);
  });

  it('rejects absurd sizes', () => {
    expect(() => documentToVoxels(createDocument({ width: 1024, height: 1024 }), { mode: 'extrude', depth: 64 })).toThrow(/too big/);
  });
});

describe('greedy meshing', () => {
  it('covers exactly the exposed faces with outward, counter-clockwise quads', () => {
    for (const mode of ['extrude', 'inflate', 'layers'] as const) checkMesh(documentToVoxels(sprite(), { mode, depth: 3 }));
  });

  it('merges coplanar faces of the same color', () => {
    const quads = checkMesh(documentToVoxels(sprite(), { mode: 'extrude', depth: 1 }));
    // Red block 2x3x1 → 6 quads, blue voxel → 6 quads.
    expect(quads).toHaveLength(12);
  });

  it('builds indexed triangle buffers centred at the bottom', () => {
    const mesh = voxelMesh(documentToVoxels(sprite(), { mode: 'extrude', depth: 2, crop: false }), { voxelSize: 0.5 });
    expect(mesh.indices.length / 3).toBe((mesh.positions.length / 12) * 2);
    expect(mesh.min).toEqual([-1, 0, -0.5]);
    expect(mesh.max).toEqual([1, 2, 0.5]);
  });
});

function readVox(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  expect(tag(0)).toBe('VOX ');
  expect(view.getInt32(4, true)).toBe(150);
  expect(tag(8)).toBe('MAIN');
  const chunks: Record<string, Uint8Array> = {};
  let o = 20;
  while (o < bytes.length) {
    const len = view.getInt32(o + 4, true);
    chunks[tag(o)] = bytes.subarray(o + 12, o + 12 + len);
    o += 12 + len + view.getInt32(o + 8, true);
  }
  const s = new DataView(chunks.SIZE.buffer, chunks.SIZE.byteOffset);
  const xyzi = chunks.XYZI;
  const n = new DataView(xyzi.buffer, xyzi.byteOffset).getInt32(0, true);
  const voxels = [];
  for (let i = 0; i < n; i++) voxels.push(Array.from(xyzi.subarray(4 + i * 4, 8 + i * 4)));
  return { size: [s.getInt32(0, true), s.getInt32(4, true), s.getInt32(8, true)], voxels, rgba: chunks.RGBA };
}

describe('writers', () => {
  it('writes MagicaVoxel .vox (Z up) with a palette', () => {
    const m = documentToVoxels(sprite(), { mode: 'extrude', depth: 2, crop: false });
    const vox = readVox(writeVox(m));
    expect(vox.size).toEqual([4, 2, 4]);
    expect(vox.voxels).toHaveLength(14);
    // Blue voxel: x = 3, top of the sprite (z = 3), palette index points to blue.
    const blue = vox.voxels.find((v) => v[0] === 3 && v[2] === 3)!;
    const p = (blue[3] - 1) * 4;
    expect(Array.from(vox.rgba.subarray(p, p + 4))).toEqual([0, 0, 255, 255]);
  });

  it('refuses .vox above 256 per axis', () => {
    const big = { sizeX: 300, sizeY: 1, sizeZ: 1, voxels: new Uint32Array(300) };
    expect(() => writeVox(big)).toThrow(/256/);
  });

  it('writes a valid binary glTF container with one material per color', () => {
    const mesh = voxelMesh(documentToVoxels(sprite(), { mode: 'extrude', depth: 1 }));
    const glb = writeGlb(mesh, 'test');
    // Non-ASCII names are UTF-8 encoded
    const named = writeGlb(mesh, 'Ñandú');
    expect(Array.from(named.subarray(20, 20 + new DataView(named.buffer).getUint32(12, true)))).toContain(0xc3);
    const view = new DataView(glb.buffer);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(8, true)).toBe(glb.length);
    const jsonLen = view.getUint32(12, true);
    const json = JSON.parse(String.fromCharCode(...glb.subarray(20, 20 + jsonLen)));
    expect(jsonLen % 4).toBe(0);
    expect(view.getUint32(20 + jsonLen, true)).toBe(json.buffers[0].byteLength);
    const prims = json.meshes[0].primitives;
    expect(prims).toHaveLength(2); // red and blue
    const vertices = prims.reduce((n: number, p: { attributes: { POSITION: number } }) => n + json.accessors[p.attributes.POSITION].count, 0);
    expect(vertices).toBe(mesh.positions.length / 3);
    // Material colors are linear floats: pure red stays (1, 0, 0).
    expect(json.materials.map((m: { name: string }) => m.name).sort()).toEqual(['color_0000ff', 'color_ff0000']);
    const red = json.materials.find((m: { name: string }) => m.name === 'color_ff0000');
    expect(red.pbrMetallicRoughness.baseColorFactor).toEqual([1, 0, 0, 1]);
  });
});
