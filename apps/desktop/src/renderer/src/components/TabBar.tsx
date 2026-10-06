import { useShallow } from 'zustand/react/shallow';
import { fileNameOf } from '../lib/platform';
import { confirmDiscard, openDialog } from '../store/actions';
import { activateTab, allTabs, closeTab, isTabDirty, useEditor, type DocTab } from '../store/editor';
import { t } from '../strings';
import { Icon } from './Icon';

function tabTitle(tab: DocTab): string {
  return tab.filePath ? fileNameOf(tab.filePath) : tab.doc.name;
}

export function TabBar() {
  // Only re-render when something shown in the tabs changes.
  const tabs = useEditor(
    useShallow((s) =>
      allTabs(s).map((tab) => `${tab.id}|${tabTitle(tab)}|${isTabDirty(tab) ? 1 : 0}|${tab.createdBy}|${tab.id === s.tabId ? 1 : 0}`),
    ),
  );

  const close = (id: string) => {
    const tab = allTabs().find((x) => x.id === id);
    if (tab && confirmDiscard(tab)) closeTab(id);
  };

  return (
    <div className="tabbar" role="tablist" data-testid="tabs">
      {tabs.map((key) => {
        const [id, title, dirty, createdBy, active] = key.split('|');
        return (
          <div
            key={id}
            role="tab"
            aria-selected={active === '1'}
            className={`tab ${active === '1' ? 'active' : ''}`}
            onClick={() => activateTab(id)}
            onAuxClick={(e) => e.button === 1 && close(id)}
            title={createdBy === 'claude' ? `${title} · ${t.mcp.createdByClaude}` : title}
          >
            {createdBy === 'claude' && <span className="claude-mark">✦</span>}
            <span className="tab-title">{title}</span>
            {dirty === '1' && <span className="dirty-dot" />}
            <button
              className="tab-close"
              title={t.tabs.close}
              onClick={(e) => {
                e.stopPropagation();
                close(id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="icon-button tab-new" title={t.menu.newSprite} onClick={() => openDialog({ kind: 'new' })}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
