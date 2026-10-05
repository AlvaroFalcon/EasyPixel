import { addLayer, duplicateLayer, mergeLayerDown, moveLayer, removeLayer, updateLayer, type Layer } from '@easypixel/core';
import { useState } from 'react';
import { commit, selectLayer, useEditor } from '../store/editor';
import { t } from '../strings';
import { Icon } from './Icon';

function LayerRow({ layer, active }: { layer: Layer; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const finishRename = (name: string) => {
    setRenaming(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== layer.name) commit((d) => updateLayer(d, layer.id, { name: trimmed }), t.layers.title);
  };
  return (
    <li className={`layer-row ${active ? 'active' : ''} ${layer.visible ? '' : 'hidden-layer'}`} onClick={() => selectLayer(layer.id)}>
      <button
        className="icon-button small"
        title={t.layers.visible}
        onClick={(e) => {
          e.stopPropagation();
          commit((d) => updateLayer(d, layer.id, { visible: !layer.visible }), t.layers.visible);
        }}
      >
        <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={14} />
      </button>
      <button
        className={`icon-button small ${layer.locked ? 'on' : 'dim'}`}
        title={t.layers.lock}
        onClick={(e) => {
          e.stopPropagation();
          commit((d) => updateLayer(d, layer.id, { locked: !layer.locked }), t.layers.lock);
        }}
      >
        <Icon name={layer.locked ? 'lock' : 'unlock'} size={14} />
      </button>
      {renaming ? (
        <input
          className="rename-input"
          autoFocus
          defaultValue={layer.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => finishRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishRename(e.currentTarget.value);
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span className="layer-name" title={t.layers.rename} onDoubleClick={() => setRenaming(true)}>
          {layer.name}
        </span>
      )}
      {layer.opacity < 1 && <span className="layer-opacity">{Math.round(layer.opacity * 100)}%</span>}
    </li>
  );
}

export function LayersPanel() {
  const layers = useEditor((s) => s.doc.layers);
  const layerId = useEditor((s) => s.layerId);
  const index = layers.findIndex((l) => l.id === layerId);
  const layer = layers[index];
  // Opacity is previewed while dragging and committed once on release.
  const [opacity, setOpacity] = useState<number | null>(null);

  return (
    <section className="panel layers-panel">
      <header className="panel-header">
        <h2>{t.layers.title}</h2>
      </header>
      <ul className="layer-list" data-testid="layers">
        {[...layers].reverse().map((l) => (
          <LayerRow key={l.id} layer={l} active={l.id === layerId} />
        ))}
      </ul>
      {layer && (
        <label className="option opacity">
          {t.layers.opacity}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((opacity ?? layer.opacity) * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            onPointerUp={() => {
              if (opacity !== null) commit((d) => updateLayer(d, layer.id, { opacity }), t.layers.opacity);
              setOpacity(null);
            }}
            onKeyUp={() => {
              if (opacity !== null) commit((d) => updateLayer(d, layer.id, { opacity }), t.layers.opacity);
              setOpacity(null);
            }}
          />
          <span className="value">{Math.round((opacity ?? layer.opacity) * 100)}%</span>
        </label>
      )}
      <div className="panel-actions">
        <button
          className="icon-button"
          title={t.layers.add}
          data-testid="add-layer"
          onClick={() => {
            let created = '';
            commit(
              (d) => {
                const r = addLayer(d, undefined, index + 1);
                created = r.layer.id;
                return r.doc;
              },
              t.layers.add,
            );
            if (created) selectLayer(created);
          }}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          title={t.layers.duplicate}
          onClick={() => {
            let created = '';
            commit(
              (d) => {
                const r = duplicateLayer(d, layerId);
                created = r.layer.id;
                return r.doc;
              },
              t.layers.duplicate,
            );
            if (created) selectLayer(created);
          }}
        >
          <Icon name="duplicate" />
        </button>
        <button
          className="icon-button"
          title={t.layers.up}
          disabled={index >= layers.length - 1}
          onClick={() => commit((d) => moveLayer(d, layerId, index + 1), t.layers.up)}
        >
          <Icon name="up" />
        </button>
        <button
          className="icon-button"
          title={t.layers.down}
          disabled={index <= 0}
          onClick={() => commit((d) => moveLayer(d, layerId, index - 1), t.layers.down)}
        >
          <Icon name="down" />
        </button>
        <button
          className="icon-button"
          title={t.layers.merge}
          disabled={index <= 0}
          onClick={() => {
            const below = layers[index - 1]?.id;
            if (commit((d) => mergeLayerDown(d, layerId), t.layers.merge) && below) selectLayer(below);
          }}
        >
          <Icon name="merge" />
        </button>
        <button
          className="icon-button"
          title={t.layers.remove}
          disabled={layers.length <= 1}
          onClick={() => commit((d) => removeLayer(d, layerId), t.layers.remove)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </section>
  );
}
