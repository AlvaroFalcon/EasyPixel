/**
 * stdio ⇄ HTTP bridge for MCP clients that only launch local commands
 * (e.g. Claude Desktop). It relays JSON-RPC messages unchanged between stdin/
 * stdout and EasyPixel's local Streamable HTTP endpoint.
 *
 * Run with Node, or with the EasyPixel/Electron binary and ELECTRON_RUN_AS_NODE=1.
 * Optional: EASYPIXEL_MCP_URL (default http://127.0.0.1:7777/mcp).
 */
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { MCP_DEFAULT_PORT, MCP_PATH } from '../shared/mcpTypes';

const url = new URL(process.env.EASYPIXEL_MCP_URL ?? `http://127.0.0.1:${MCP_DEFAULT_PORT}${MCP_PATH}`);
const log = (msg: string) => process.stderr.write(`[easypixel-bridge] ${msg}\n`);

const stdio = new StdioServerTransport();
let http: StreamableHTTPClientTransport | null = null;

function newHttp(): StreamableHTTPClientTransport {
  const t = new StreamableHTTPClientTransport(url);
  t.onmessage = (message) => void stdio.send(message);
  t.onerror = (e) => log(`http error: ${e.message}`);
  return t;
}

stdio.onmessage = async (message: JSONRPCMessage) => {
  try {
    if (!http) {
      http = newHttp();
      await http.start();
    }
    await http.send(message);
  } catch (e) {
    // EasyPixel is probably closed: answer requests so the client doesn't hang,
    // and reconnect on the next message.
    http = null;
    const reason = `EasyPixel is not reachable at ${url} — open the EasyPixel app and try again. (${(e as Error).message})`;
    log(reason);
    if ('id' in message && 'method' in message) {
      await stdio.send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: reason } });
    }
  }
};
stdio.onclose = () => {
  void http?.close();
  process.exit(0);
};

stdio
  .start()
  .then(() => log(`relaying stdio to ${url}`))
  .catch((e: Error) => {
    log(`failed to start: ${e.message}`);
    process.exit(1);
  });
