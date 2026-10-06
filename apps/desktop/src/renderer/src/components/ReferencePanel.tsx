import { useEditor } from '../store/editor';
import { loadReference, removeReference, updateReference, useReference } from '../store/reference';
import { t } from '../strings';
import { Icon } from './Icon';

/** Shown in the sidebar while the active tab has a reference image. */
export function ReferencePanel() {
  const tabId = useEditor((s) => s.tabId);
  const ref = useReference((s) => s.byTab[tabId]);
  if (!ref) return null;
  return (
    <section className="panel reference-panel" data-testid="reference-panel">
      <header className="panel-header">
        <h2>{t.reference.title}</h2>
        <div className="panel-actions inline">
          <button className="icon-button small" title={t.layers.visible} onClick={() => updateReference({ visible: !ref.visible })}>
            <Icon name={ref.visible ? 'eye' : 'eyeOff'} size={14} />
          </button>
          <button className="icon-button small" title={t.reference.replace} onClick={() => void loadReference()}>
            <Icon name="duplicate" size={14} />
          </button>
          <button className="icon-button small" title={t.reference.remove} onClick={removeReference}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </header>
      <p className="muted reference-name" title={ref.name}>
        {ref.name}
      </p>
      <label className="option slider-row">
        {t.layers.opacity}
        <input type="range" min={5} max={100} value={Math.round(ref.opacity * 100)} onChange={(e) => updateReference({ opacity: Number(e.target.value) / 100 })} />
        <span className="value">{Math.round(ref.opacity * 100)}%</span>
      </label>
      <label className="option slider-row">
        {t.reference.zoom}
        <input type="range" min={25} max={400} step={5} value={Math.round(ref.zoom * 100)} onChange={(e) => updateReference({ zoom: Number(e.target.value) / 100 })} />
        <span className="value">{Math.round(ref.zoom * 100)}%</span>
      </label>
      <label className="option">
        <input type="checkbox" checked={ref.above} onChange={(e) => updateReference({ above: e.target.checked })} />
        {t.reference.above}
      </label>
    </section>
  );
}
