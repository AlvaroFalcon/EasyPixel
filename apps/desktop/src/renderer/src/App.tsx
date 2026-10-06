import { useEffect } from 'react';
import { CanvasView } from './components/CanvasView';
import { Dialogs } from './components/Dialogs';
import { FramesPanel } from './components/FramesPanel';
import { LayersPanel } from './components/LayersPanel';
import { MenuBar } from './components/MenuBar';
import { PalettePanel } from './components/PalettePanel';
import { PreviewPanel } from './components/PreviewPanel';
import { ReferencePanel } from './components/ReferencePanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { Toolbar, ToolOptions } from './components/Toolbar';
import { fileNameOf, setWindowState } from './lib/platform';
import { installMcp } from './mcp/connection';
import { installShortcuts } from './shortcuts';
import { anyDirty, useEditor } from './store/editor';

export function App() {
  const dirty = useEditor(anyDirty);
  const title = useEditor((s) => (s.filePath ? fileNameOf(s.filePath) : s.doc.name));

  useEffect(installShortcuts, []);
  useEffect(installMcp, []);
  useEffect(() => setWindowState(title, dirty), [title, dirty]);

  return (
    <div className="app">
      <MenuBar />
      <ToolOptions />
      <div className="workspace">
        <Toolbar />
        <main className="stage">
          <TabBar />
          <div className="canvas-host">
            <CanvasView />
          </div>
        </main>
        <aside className="sidebar">
          <PreviewPanel />
          <PalettePanel />
          <LayersPanel />
          <ReferencePanel />
        </aside>
      </div>
      <FramesPanel />
      <StatusBar />
      <Dialogs />
    </div>
  );
}
