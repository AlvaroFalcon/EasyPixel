// Bundles the MCP stdio bridge into one self-contained file (no node_modules
// needed), so the app can copy it to a stable location for Claude Desktop.
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [resolve(root, 'src/bridge/index.ts')],
  outfile: resolve(root, 'out/bridge/mcp-bridge.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'warning',
});
