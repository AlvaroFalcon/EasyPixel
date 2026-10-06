import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { executeTool } from './mcp/executor';
import { useEditor } from './store/editor';
import './styles.css';

// Handle used by the browser tests (e2e/) to inspect the document and run MCP tools without Electron.
if (import.meta.env.DEV) {
  (window as unknown as { __easypixel: unknown }).__easypixel = { getState: useEditor.getState, executeTool };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
