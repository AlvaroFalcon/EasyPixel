/** MCP constants and IPC types without runtime dependencies (safe for the sandboxed preload). */

export const MCP_DEFAULT_PORT = 7777;
export const MCP_PATH = '/mcp';

export const MCP_IPC = {
  call: 'easypixel:mcp-call',
  result: 'easypixel:mcp-result',
  status: 'easypixel:mcp-status',
  info: 'easypixel:mcp-info',
} as const;

export interface McpStatus {
  state: 'starting' | 'listening' | 'error';
  url: string;
  port: number;
  error?: string;
  /** Command line pieces to run the stdio bridge (for Claude Desktop). */
  bridge: { command: string; args: string[]; env: Record<string, string> };
}

export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export interface McpCall {
  id: number;
  tool: string;
  args: Record<string, unknown>;
}

