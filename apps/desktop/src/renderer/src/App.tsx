import { useEffect } from 'react';
import { CanvasView } from './components/CanvasView';
import { Dialogs } from './components/Dialogs';
import { FramesPanel } from './components/FramesPanel';
import { LayersPanel } from './components/LayersPanel';
import { MenuBar } from './components/MenuBar';
import { PalettePanel } from './components/PalettePanel';
import { PreviewPanel } from './components/PreviewPanel';
import { StatusBar } from './components/StatusBar';
import { Toolbar, ToolOptions } from './components/Toolbar';
import { fileNameOf, setWindowState } from './lib/platform';
import { installShortcuts } from './shortcuts';
import { isDirty, useEditor } from './store/editor';

export function App() {
  const dirty = useEditor(isDirty);
  const title = useEditor((s) => (s.filePath ? fileNameOf(s.filePath) : s.doc.name));

  useEffect(installShortcuts, []);
  useEffect(() => setWindowState(title, dirty), [title, dirty]);

  return (
    <div className="app">
      <MenuBar />
      <ToolOptions />
      <div className="workspace">
        <Toolbar />
        <main className="stage">
          <CanvasView />
        </main>
        <aside className="sidebar">
          <PreviewPanel />
          <PalettePanel />
          <LayersPanel />
        </aside>
      </div>
      <FramesPanel />
      <StatusBar />
      <Dialogs />
    </div>
  );
}
