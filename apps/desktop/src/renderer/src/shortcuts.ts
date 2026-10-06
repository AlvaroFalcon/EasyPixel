import { importPng, openDialog, openSprite, saveSprite, useDialog } from './store/actions';
import {
  cancelFloating,
  copySelection,
  cutSelection,
  deleteSelection,
  deselect,
  pasteFloating,
  redo,
  selectAll,
  selectFrame,
  setTool,
  settleFloating,
  swapColors,
  togglePlaying,
  undo,
  useEditor,
} from './store/editor';
import { cancelSession, isDrawing, TOOL_SHORTCUTS } from './store/tools';
import { fitToView, stepZoom } from './store/view';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Global keyboard shortcuts. Returns a cleanup function. */
export function installShortcuts(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || useDialog.getState().dialog) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;

    if (mod) {
      switch (key) {
        case 'z':
          cancelSession();
          if (e.shiftKey) redo();
          else undo();
          break;
        case 'y':
          cancelSession();
          redo();
          break;
        case 's':
          void saveSprite(e.shiftKey);
          break;
        case 'o':
          void openSprite();
          break;
        case 'n':
          openDialog({ kind: 'new' });
          break;
        case 'i':
          void importPng();
          break;
        case 'e':
          openDialog({ kind: 'export' });
          break;
        case 'c':
          copySelection();
          break;
        case 'x':
          cutSelection();
          break;
        case 'v':
          pasteFloating();
          break;
        case 'a':
          selectAll();
          break;
        case 'd':
          deselect();
          break;
        case 'g':
          useEditor.setState((s) => ({ showGrid: !s.showGrid }));
          break;
        default:
          handled = false;
      }
    } else if (!e.altKey) {
      if (isDrawing() && key !== 'escape') return;
      if (TOOL_SHORTCUTS[key]) setTool(TOOL_SHORTCUTS[key]);
      else
        switch (e.key) {
          case 'x':
          case 'X':
            swapColors();
            break;
          case 'p':
          case 'P':
            togglePlaying();
            break;
          case '[':
            useEditor.setState((s) => ({ brushSize: Math.max(1, s.brushSize - 1) }));
            break;
          case ']':
            useEditor.setState((s) => ({ brushSize: Math.min(16, s.brushSize + 1) }));
            break;
          case ',':
            selectFrame(useEditor.getState().frameIndex - 1);
            break;
          case '.':
            selectFrame(useEditor.getState().frameIndex + 1);
            break;
          case '+':
          case '=':
            stepZoom(1);
            break;
          case '-':
            stepZoom(-1);
            break;
          case '0':
            fitToView();
            break;
          case 'Delete':
          case 'Backspace':
            deleteSelection();
            break;
          case 'Enter':
            settleFloating();
            break;
          case 'Escape':
            if (!cancelSession()) {
              if (useEditor.getState().floating) cancelFloating();
              else deselect();
            }
            break;
          default:
            handled = false;
        }
    } else {
      handled = false;
    }
    if (handled) e.preventDefault();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
