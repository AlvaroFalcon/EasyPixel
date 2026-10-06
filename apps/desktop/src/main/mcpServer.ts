import { createServer, type Server as HttpServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BrowserWindow, ipcMain } from 'electron';
import { z } from 'zod';
import {
  MCP_IPC,
  MCP_PATH,
  PIXEL_ART_PROMPT,
  SERVER_INSTRUCTIONS,
  TOOLS,
  type McpCall,
  type McpStatus,
  type McpToolResult,
  type ToolName,
} from '../shared/mcp';

/**
 * Local MCP server (Streamable HTTP, stateless) bound to 127.0.0.1.
 *
 * Tool calls are forwarded to the renderer, which owns the editor state:
 * that way Claude's edits are shown live, go through the same undo history
 * as the user's, and target whatever the user currently has open.
 */

const CALL_TIMEOUT_MS = 60_000;
const MAX_INPUT_ELEMENTS = 200_000;

let nextCallId = 0;
const pending = new Map<number, { resolve: (r: McpToolResult) => void; timer: NodeJS.Timeout }>();

ipcMain.on(MCP_IPC.result, (_event, payload: { id: number; result: McpToolResult }) => {
  const entry = pending.get(payload.id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(payload.id);
  entry.resolve(payload.result);
});

function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function callRenderer(getWindow: () => BrowserWindow | null, tool: ToolName, args: Record<string, unknown>): Promise<McpToolResult> {
  const win = getWindow();
  if (!win || win.isDestroyed()) return Promise.resolve(errorResult('The EasyPixel window is not open.'));
  const id = ++nextCallId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(errorResult(`EasyPixel did not answer "${tool}" within ${CALL_TIMEOUT_MS / 1000}s.`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    const call: McpCall = { id, tool, args };
    win.webContents.send(MCP_IPC.call, call);
  });
}

function buildServer(getWindow: () => BrowserWindow | null): McpServer {
  const server = new McpServer(
    { name: 'easypixel', title: 'EasyPixel', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS, maxToolInputElements: MAX_INPUT_ELEMENTS },
  );

  for (const [name, spec] of Object.entries(TOOLS) as [ToolName, (typeof TOOLS)[ToolName]][]) {
    const meta = spec as { readOnly?: boolean; destructive?: boolean };
    server.registerTool(
      name,
      {
        title: spec.title,
        description: spec.description,
        inputSchema: spec.input,
        annotations: {
          title: spec.title,
          readOnlyHint: !!meta.readOnly,
          destructiveHint: !!meta.destructive,
          idempotentHint: !!meta.readOnly,
          openWorldHint: false,
        },
      },
      // The SDK has already validated `args` against the zod schema.
      async (args: Record<string, unknown>) => (await callRenderer(getWindow, name, args)) as never,
    );
  }

  server.registerPrompt(
    'pixel_art_sprite',
    {
      title: 'Draw a pixel art sprite',
      description: 'Guided workflow to draw a sprite (and its animations) in EasyPixel.',
      argsSchema: {
        subject: z.string().describe('What to draw, e.g. "a knight with a blue cape"'),
        size: z.string().optional().describe('Canvas size, e.g. "32x32"'),
        animations: z.string().optional().describe('e.g. "idle (4 frames), walk (6 frames)"'),
      },
    },
    ({ subject, size, animations }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: PIXEL_ART_PROMPT(subject, size ?? '32x32', animations ?? '') } }],
    }),
  );

  return server;
}

export interface McpServerHandle {
  status: McpStatus;
  close(): void;
}

export function startMcpServer(opts: {
  port: number;
  getWindow: () => BrowserWindow | null;
  bridge: McpStatus['bridge'];
  onStatus: (status: McpStatus) => void;
}): McpServerHandle {
  const url = `http://127.0.0.1:${opts.port}${MCP_PATH}`;
  const handle: McpServerHandle = {
    status: { state: 'starting', url, port: opts.port, bridge: opts.bridge },
    close: () => http.close(),
  };
  const update = (patch: Partial<McpStatus>) => {
    handle.status = { ...handle.status, ...patch };
    opts.onStatus(handle.status);
  };

  const http: HttpServer = createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== MCP_PATH) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('EasyPixel MCP endpoint is ' + MCP_PATH);
      return;
    }
    if (req.method !== 'POST') {
      // Stateless server: no standalone SSE stream and no sessions to delete.
      res.writeHead(405, { allow: 'POST' }).end();
      return;
    }
    // A fresh server + transport per request is the SDK's recommended stateless setup.
    const server = buildServer(opts.getWindow);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [`127.0.0.1:${opts.port}`, `localhost:${opts.port}`],
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' }).end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: (e as Error).message }, id: null }),
        );
      }
    }
  });

  http.on('error', (e: NodeJS.ErrnoException) => {
    const error = e.code === 'EADDRINUSE' ? `port ${opts.port} is already in use (is EasyPixel already open?)` : e.message;
    update({ state: 'error', error });
  });
  http.listen(opts.port, '127.0.0.1', () => update({ state: 'listening', error: undefined }));

  return handle;
}
