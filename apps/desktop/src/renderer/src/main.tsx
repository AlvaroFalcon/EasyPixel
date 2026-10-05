import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useEditor } from './store/editor';
import './styles.css';

// Read-only handle used by the browser tests (e2e/) to inspect the document.
if (import.meta.env.DEV) {
  (window as unknown as { __easypixel: unknown }).__easypixel = { getState: useEditor.getState };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
