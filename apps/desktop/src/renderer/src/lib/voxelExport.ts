import {
  countVoxels,
  documentToVoxels,
  snakeName,
  voxelMesh,
  writeGlb,
  writeVox,
  type SpriteDocument,
  type VoxelMesh,
  type VoxelMode,
  type VoxelModel,
} from '@easypixel/core';

export type VoxelFormat = 'glb' | 'vox';

export interface VoxelSettings {
  mode: VoxelMode;
  depth: number;
  frame: number;
  format: VoxelFormat;
  /** Meters per voxel (glTF only). */
  voxelSize: number;
}

export interface VoxelBuild {
  model: VoxelModel;
  mesh: VoxelMesh;
  filled: number;
  triangles: number;
}

/** Voxelizes the document and meshes it (shared by the export dialog and the MCP tools). */
export function buildVoxels(doc: SpriteDocument, s: Pick<VoxelSettings, 'mode' | 'depth' | 'frame' | 'voxelSize'>): VoxelBuild {
  const model = documentToVoxels(doc, { mode: s.mode, depth: s.depth, frame: s.frame });
  const mesh = voxelMesh(model, { voxelSize: s.voxelSize });
  return { model, mesh, filled: countVoxels(model), triangles: mesh.indices.length / 3 };
}

export function voxelFileBytes(doc: SpriteDocument, build: VoxelBuild, format: VoxelFormat): Uint8Array {
  return format === 'vox' ? writeVox(build.model) : writeGlb(build.mesh, snakeName(doc.name));
}

export function voxelFileName(doc: SpriteDocument, format: VoxelFormat): string {
  return `${snakeName(doc.name)}.${format}`;
}

/** Sensible default thickness per mode for a sprite of this size. */
export function defaultDepth(mode: VoxelMode, doc: SpriteDocument): number {
  if (mode === 'inflate') return Math.max(3, Math.round(Math.min(doc.width, doc.height) / 3) | 1);
  if (mode === 'extrude') return Math.max(1, Math.round(Math.min(doc.width, doc.height) / 8));
  return 1;
}
