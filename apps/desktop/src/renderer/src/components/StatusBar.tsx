import { useEffect, useState } from 'react';
import { useMcp } from '../mcp/connection';
import { openDialog } from '../store/actions';
import { currentLayer, useEditor } from '../store/editor';
import { fmt, t } from '../strings';

/** MCP server state + a short-lived "Claude is working" indicator. */
function McpIndicator() {
  const status = useMcp((s) => s.status);
  const activity = useEditor((s) => s.claudeActivity);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!activity) return;
    const timer = setTimeout(() => tick((n) => n + 1), 2500);
    return () => clearTimeout(timer);
  }, [activity]);
  const recent = activity && Date.now() - activity.at < 2500;
  const state = status?.state ?? 'off';
  const title = !status ? t.mcp.webOnly : status.state === 'error' ? fmt(t.mcp.error, { error: status.error ?? '' }) : fmt(t.mcp.listening, { url: status.url });
  return (
    <button className={`mcp-indicator ${state} ${recent ? 'busy' : ''}`} title={title} onClick={() => openDialog({ kind: 'mcp' })} data-testid="mcp-indicator">
      <span className="mcp-dot" />
      {recent ? fmt(t.mcp.working, { tool: activity!.tool }) : 'MCP'}
    </button>
  );
}

export function StatusBar() {
  const cursor = useEditor((s) => s.cursor);
  const width = useEditor((s) => s.doc.width);
  const height = useEditor((s) => s.doc.height);
  const zoom = useEditor((s) => s.zoom);
  const layer = useEditor((s) => currentLayer(s)?.name);
  const selection = useEditor((s) => s.selection);
  const lastEdit = useEditor((s) => s.history.present);
  const notice = useEditor((s) => s.notice);
  const [visibleNotice, setVisibleNotice] = useState(notice);

  // Notices fade out after a few seconds.
  useEffect(() => {
    setVisibleNotice(notice);
    if (!notice) return;
    const timer = setTimeout(() => setVisibleNotice(null), notice.kind === 'error' ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <footer className="statusbar">
      <McpIndicator />
      <span className="status-item mono">{cursor ? `${cursor.x}, ${cursor.y}` : '—'}</span>
      <span className="status-item mono">
        {width}×{height}
      </span>
      {selection && (
        <span className="status-item mono">
          ⬚ {selection.width}×{selection.height}
        </span>
      )}
      <span className="status-item mono">{zoom * 100}%</span>
      <span className="status-item">{layer}</span>
      <span className="status-item muted" title="Última acción">
        {lastEdit.source === 'claude' ? '✦ ' : ''}
        {lastEdit.label}
      </span>
      <span className={`status-notice ${visibleNotice?.kind ?? ''}`} role="status" data-testid="notice">
        {visibleNotice?.text}
      </span>
    </footer>
  );
}
