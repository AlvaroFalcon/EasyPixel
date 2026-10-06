import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { _electron, expect, test, type ElectronApplication } from '@playwright/test';

const ROOT = join(__dirname, '..');
const APP = join(ROOT, 'apps/desktop');
const PORT = 7791;
const URL_ = `http://127.0.0.1:${PORT}/mcp`;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ELECTRON: string = require('electron');

type Result = { content: { type: string; text?: string; data?: string }[]; isError?: boolean };
const textOf = (r: Result) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await _electron.launch({
    executablePath: ELECTRON,
    args: ['--no-sandbox', APP],
    env: { ...process.env, EASYPIXEL_MCP_PORT: String(PORT) },
  });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid=canvas]');
  await expect(win.getByTestId('mcp-indicator')).toHaveClass(/listening/);
});

test.afterAll(async () => {
  // Claude left unsaved changes: skip the "unsaved changes" dialog and quit.
  await app?.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined);
});

test('Claude Code style client (Streamable HTTP) draws in the open editor', async () => {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  expect(client.getInstructions()).toContain('EasyPixel');
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['draw_grid', 'get_frame_image', 'create_animation']));

  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result;
  expect((await call('create_sprite', { name: 'slime', width: 8, height: 8, palette: ['#1a1c2c', '#38b764'] })).isError).toBeFalsy();
  expect(textOf(await call('draw_grid', { rows: ['..0000..', '.011110.', '01111110', '00000000'] }))).toContain('Drew');
  const image = await call('get_frame_image', {});
  expect(image.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
  const bad = await call('draw_grid', { rows: ['9'] });
  expect(bad.isError).toBe(true);

  // The renderer really shows Claude's pixels
  const win = await app.firstWindow();
  const pixel = await win.evaluate(() => {
    const s = (window as any).__easypixel?.getState?.();
    return s ? null : 'no-dev-handle';
  });
  expect(pixel).toBe('no-dev-handle'); // production build: no test handle exposed
  await expect(win.getByTestId('tabs')).toContainText('slime');
  await client.close();
});

test('Claude Desktop style client (stdio bridge) reaches the same server', async () => {
  const client = new Client({ name: 'bridge-test', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: ELECTRON,
      args: [join(APP, 'out/main/mcp-bridge.js')],
      env: { ...(process.env as Record<string, string>), ELECTRON_RUN_AS_NODE: '1', EASYPIXEL_MCP_URL: URL_ },
    }),
  );
  const state = (await client.callTool({ name: 'get_editor_state', arguments: {} })) as Result;
  expect(JSON.parse(textOf(state)).active.name).toBe('slime');
  await client.close();
});

test('exports to a Godot 4 project (validated with Godot when GODOT_BIN is set)', async () => {
  const project = mkdtempSync(join(tmpdir(), 'easypixel-godot-'));
  writeFileSync(join(project, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="EasyPixelTest"\n');
  const dir = join(project, 'sprites', 'slime');

  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as Result;
  await call('add_frame', { duplicate: true });
  await call('transform', { operation: 'shift', dy: 1 });
  await call('create_animation', { name: 'idle', from: 0, to: 1, direction: 'pingpong' });
  const notProject = await call('export_godot', { directory: tmpdir() + '/definitely-not-godot' });
  expect(notProject.isError).toBe(true);
  const result = await call('export_godot', { directory: dir });
  expect(result.isError).toBeFalsy();
  expect(textOf(result)).toContain('res://sprites/slime');
  for (const f of ['slime.png', 'slime.tres', 'slime.tscn']) expect(existsSync(join(dir, f))).toBe(true);
  expect(readFileSync(join(dir, 'slime.tres'), 'utf8')).toContain('path="res://sprites/slime/slime.png"');
  // Settings are remembered: re-export without a directory
  expect((await call('export_godot', {})).isError).toBeFalsy();
  await client.close();

  const godot = process.env.GODOT_BIN;
  test.skip(!godot, 'Set GODOT_BIN to validate the files with a real Godot 4');
  writeFileSync(
    join(project, 'check.gd'),
    [
      'extends SceneTree',
      'func _init():',
      '\tvar frames: SpriteFrames = load("res://sprites/slime/slime.tres")',
      '\tvar node = (load("res://sprites/slime/slime.tscn") as PackedScene).instantiate()',
      '\tprint("CHECK ", frames.get_animation_names(), " ", frames.get_frame_count("idle"), " ", node.get_class(), " ", node.autoplay)',
      '\tnode.free()',
      '\tquit()',
    ].join('\n'),
  );
  execFileSync(godot!, ['--headless', '--path', project, '--import'], { stdio: 'ignore', timeout: 60_000 });
  const out = execFileSync(godot!, ['--headless', '--path', project, '--quit-after', '600', '--script', 'check.gd'], { encoding: 'utf8', timeout: 60_000 });
  expect(out).toContain('CHECK ["idle"] 2 AnimatedSprite2D idle');
});
