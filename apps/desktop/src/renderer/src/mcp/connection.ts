import { create } from 'zustand';
import type { McpStatus } from '../../../shared/mcp';
import { executeTool } from './executor';

export const useMcp = create<{ status: McpStatus | null }>(() => ({ status: null }));

/** Wires MCP tool calls from the Electron main process to the executor. No-op in the browser. */
export function installMcp(): () => void {
  const api = window.easypixel?.mcp;
  if (!api) return () => {};
  void api.getStatus().then((status) => status && useMcp.setState({ status }));
  const offStatus = api.onStatus((status) => useMcp.setState({ status }));
  const offCall = api.onCall((call) => {
    void executeTool(call).then((result) => api.sendResult(call.id, result));
  });
  return () => {
    offStatus();
    offCall();
  };
}

export function claudeCodeCommand(status: McpStatus): string {
  return `claude mcp add --transport http easypixel ${status.url}`;
}

export function claudeDesktopConfig(status: McpStatus): string {
  const { command, args, env } = status.bridge;
  return JSON.stringify({ mcpServers: { easypixel: { command, args, env } } }, null, 2);
}
