import type { VoxelMesh } from '@easypixel/core';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

/**
 * Minimal three.js viewer for voxel meshes: lit, flat-shaded, with drag to
 * orbit and wheel to zoom. Also used offscreen to render previews for Claude.
 */
export interface VoxelViewer {
  setMesh(mesh: VoxelMesh): void;
  /** Camera angles in degrees: yaw around Y, pitch above the horizon. */
  setAngles(yaw: number, pitch: number): void;
  resize(width: number, height: number): void;
  render(): void;
  /** Frees GPU resources. `loseContext` also releases the WebGL context (only for throwaway canvases). */
  dispose(loseContext?: boolean): void;
}

function geometryOf(mesh: VoxelMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  // Mesh colors are sRGB; three expects linear vertex colors.
  const linear = new Float32Array(mesh.colors.length);
  const c = new Color();
  for (let i = 0; i < mesh.colors.length; i += 4) {
    c.setRGB(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2], SRGBColorSpace);
    linear.set([c.r, c.g, c.b, 1], i);
  }
  g.setAttribute('color', new BufferAttribute(linear, 4));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  return g;
}

export function createVoxelViewer(canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}): VoxelViewer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.1));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-1, 2, 1.5);
  scene.add(sun);
  const fill = new DirectionalLight(0xffffff, 0.6);
  fill.position.set(1.5, 0.5, -1);
  scene.add(fill);
  const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
  const material = new MeshLambertMaterial({ vertexColors: true });
  let mesh: Mesh | null = null;
  let grid: GridHelper | null = null;
  let yaw = -30;
  let pitch = 20;
  let distance = 3;
  const target = new Vector3();

  const place = () => {
    const y = (yaw * Math.PI) / 180;
    const p = (pitch * Math.PI) / 180;
    camera.position.set(
      target.x + distance * Math.cos(p) * Math.sin(y),
      target.y + distance * Math.sin(p),
      target.z + distance * Math.cos(p) * Math.cos(y),
    );
    camera.lookAt(target);
  };

  const viewer: VoxelViewer = {
    setMesh(m) {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      if (grid) scene.remove(grid);
      mesh = new Mesh(geometryOf(m), material);
      scene.add(mesh);
      const size = new Vector3(m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]);
      const radius = Math.max(size.length() / 2, 0.01);
      target.set((m.min[0] + m.max[0]) / 2, (m.min[1] + m.max[1]) / 2, (m.min[2] + m.max[2]) / 2);
      distance = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.15;
      camera.near = distance / 100;
      camera.far = distance * 100;
      camera.updateProjectionMatrix();
      const gridSize = Math.max(size.x, size.z) * 2 || 1;
      grid = new GridHelper(gridSize, 8, 0x5fd3ff, 0x3a3f52);
      grid.position.y = m.min[1];
      scene.add(grid);
      place();
      viewer.render();
    },
    setAngles(newYaw, newPitch) {
      yaw = newYaw;
      pitch = Math.max(-85, Math.min(85, newPitch));
      place();
      viewer.render();
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      viewer.render();
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose(loseContext = false) {
      mesh?.geometry.dispose();
      material.dispose();
      renderer.dispose();
      // Never on a canvas that may be reused (e.g. React remounts): its context would stay lost.
      if (loseContext) renderer.forceContextLoss();
    },
  };

  // Drag to orbit, wheel to zoom.
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    viewer.setAngles(drag.yaw - (e.clientX - drag.x) * 0.5, drag.pitch + (e.clientY - drag.y) * 0.4);
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      distance *= e.deltaY > 0 ? 1.1 : 0.9;
      place();
      viewer.render();
    },
    { passive: false },
  );
  return viewer;
}

/** Renders a mesh offscreen and returns PNG bytes (for the MCP preview tool). */
export async function renderVoxelPng(mesh: VoxelMesh, opts: { size?: number; yaw?: number; pitch?: number; background?: string } = {}): Promise<Uint8Array> {
  const size = opts.size ?? 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const viewer = createVoxelViewer(canvas, { preserveDrawingBuffer: true });
  viewer.resize(size, size);
  viewer.setMesh(mesh);
  viewer.setAngles(opts.yaw ?? -30, opts.pitch ?? 20);
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = opts.background ?? '#2a2c35';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(canvas, 0, 0, size, size);
  viewer.dispose(true);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not render the 3D preview');
  return new Uint8Array(await blob.arrayBuffer());
}
