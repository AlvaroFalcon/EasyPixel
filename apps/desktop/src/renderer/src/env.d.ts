/// <reference types="vite/client" />
import type { EasyPixelApi } from '../../shared/api';

declare global {
  interface Window {
    /** Present when running inside Electron (see src/preload). */
    easypixel?: EasyPixelApi;
  }
}

export {};
