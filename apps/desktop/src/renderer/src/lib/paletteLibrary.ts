import { lospecJsonUrl, parseHex, parseLospecJson, toHex, type Color } from '@easypixel/core';
import { create } from 'zustand';

/** Palettes saved by the user, kept in this computer's local storage. */
export interface SavedPalette {
  id: string;
  name: string;
  colors: string[];
}

const KEY = 'easypixel.palettes.v1';

function load(): SavedPalette[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === 'string' && Array.isArray(p.colors)) : [];
  } catch {
    return [];
  }
}

function persist(palettes: SavedPalette[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(palettes));
  } catch {
    // Storage unavailable (private mode / quota): the library just won't persist.
  }
}

export const usePaletteLibrary = create<{ palettes: SavedPalette[] }>(() => ({ palettes: load() }));

export function savePalette(name: string, colors: Color[]): void {
  const palettes = usePaletteLibrary.getState().palettes.filter((p) => p.name !== name);
  palettes.push({ id: `user-${Date.now().toString(36)}`, name, colors: colors.map((c) => toHex(c)) });
  palettes.sort((a, b) => a.name.localeCompare(b.name));
  usePaletteLibrary.setState({ palettes });
  persist(palettes);
}

export function deletePalette(id: string): void {
  const palettes = usePaletteLibrary.getState().palettes.filter((p) => p.id !== id);
  usePaletteLibrary.setState({ palettes });
  persist(palettes);
}

export function paletteColors(p: SavedPalette): Color[] {
  return p.colors.map((c) => parseHex(c));
}

export async function fetchLospecPalette(input: string): Promise<{ name: string; colors: Color[] }> {
  const url = lospecJsonUrl(input);
  const text = window.easypixel
    ? await window.easypixel.fetchLospec(url)
    : await fetch(url).then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Palette not found on Lospec' : `Lospec answered ${r.status}`);
        return r.text();
      });
  return parseLospecJson(text);
}
