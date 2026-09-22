import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TITLE = 'ARENAS';

const TOML_ENV = `${process.env.KV_FAKE_TOML || ''}`;
const tomlPath = TOML_ENV
  ? TOML_ENV
  : fileURLToPath(new URL('../wrangler.toml', import.meta.url));

function wrangler(args) {
  if (process.env.KV_FAKE === '1') {
    const fake = fileURLToPath(new URL('../test/fixtures/fake-wrangler.mjs', import.meta.url));
    if (!process.env.KV_FAKE_TOML) process.env.KV_FAKE_TOML = tomlPath;
    const r = spawnSync(process.execPath, [fake, ...args], { encoding: 'utf8' });
    return { ok: r.status === 0, out: `${r.stdout}\n${r.stderr}` };
  }
  const r = spawnSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}\n${r.stderr}` };
}

function firstJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractId(out) {
  const patterns = [
    /id\s*=\s*"([0-9a-f]{32})"/i,
    /id["']?\s*[:=]\s*"?\s*([0-9a-f]{32})/i,
    /namespace\s+(?:with)?\s*id\s+([0-9a-f]{32})/i,
    /"id"\s*:\s*"([0-9a-f]{32})"/i,
  ];
  for (const re of patterns) {
    const m = out.match(re);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

let id = null;

const list = wrangler(['kv', 'namespace', 'list']);
if (list.ok) {
  const arr = firstJsonArray(list.out);
  const hit = Array.isArray(arr) ? arr.find((n) => n.title === TITLE) : null;
  if (hit) id = hit.id;
}

if (!id) {
  const created = wrangler(['kv', 'namespace', 'create', TITLE]);
  id = extractId(created.out);
}

if (!id) {
  console.error('Could not determine KV namespace id.');
  console.error(list.out);
  process.exit(1);
}

let toml = readFileSync(tomlPath, 'utf8');
if (!toml.includes(id)) {
  if (!toml.includes('<AUTO>')) {
    console.error('wrangler.toml has no <AUTO> placeholder to fill.');
    process.exit(1);
  }
  toml = toml.replace(/(id\s*=\s*)"<AUTO>"/, `$1"${id}"`);
  writeFileSync(tomlPath, toml);
}

console.log(`KV namespace "${TITLE}" ready: ${id}`);