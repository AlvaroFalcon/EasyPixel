import { useShallow } from 'zustand/react/shallow';
import { setTool, useEditor, type ToolId } from '../store/editor';
import { TOOL_ORDER, TOOL_SHORTCUTS } from '../store/tools';
import { t } from '../strings';
import { Icon } from './Icon';

const SHORTCUT_BY_TOOL = Object.fromEntries(Object.entries(TOOL_SHORTCUTS).map(([k, v]) => [v, k.toUpperCase()])) as Record<ToolId, string>;

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  return (
    <nav className="toolbar" aria-label="Herramientas">
      {TOOL_ORDER.map((id) => (
        <button
          key={id}
          className={`tool-button ${tool === id ? 'active' : ''}`}
          title={`${t.tools[id]} (${SHORTCUT_BY_TOOL[id]})`}
          aria-pressed={tool === id}
          data-testid={`tool-${id}`}
          onClick={() => setTool(id)}
        >
          <Icon name={id} size={20} />
        </button>
      ))}
    </nav>
  );
}

export function ToolOptions() {
  const s = useEditor(
    useShallow((st) => ({
      tool: st.tool,
      brushSize: st.brushSize,
      pixelPerfect: st.pixelPerfect,
      mirrorX: st.mirrorX,
      mirrorY: st.mirrorY,
      fillContiguous: st.fillContiguous,
      shapeFilled: st.shapeFilled,
    })),
  );
  const toggle = (key: 'pixelPerfect' | 'mirrorX' | 'mirrorY' | 'fillContiguous' | 'shapeFilled', label: string, title?: string) => (
    <label className="option" title={title}>
      <input type="checkbox" checked={s[key]} onChange={(e) => useEditor.setState({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  const freehand = s.tool === 'pencil' || s.tool === 'eraser';
  const shape = s.tool === 'rect' || s.tool === 'ellipse';
  const drawing = freehand || shape || s.tool === 'line';

  return (
    <div className="tool-options">
      <span className="tool-name">{t.tools[s.tool]}</span>
      {freehand && (
        <label className="option">
          {t.options.brushSize}
          <input
            type="range"
            min={1}
            max={16}
            value={s.brushSize}
            onChange={(e) => useEditor.setState({ brushSize: Number(e.target.value) })}
          />
          <span className="value">{s.brushSize}px</span>
        </label>
      )}
      {s.tool === 'pencil' && s.brushSize === 1 && toggle('pixelPerfect', t.options.pixelPerfect, t.options.pixelPerfectHint)}
      {drawing && toggle('mirrorX', t.options.mirrorX)}
      {drawing && toggle('mirrorY', t.options.mirrorY)}
      {shape && toggle('shapeFilled', t.options.filled)}
      {s.tool === 'bucket' && toggle('fillContiguous', t.options.contiguous)}
      {s.tool === 'select' && <span className="hint">{t.options.selectHint}</span>}
    </div>
  );
}
