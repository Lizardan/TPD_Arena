import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FAKE_ID = '9d1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c';
const scriptPath = fileURLToPath(new URL('../scripts/ensure-kv.mjs', import.meta.url));
const realTomlPath = fileURLToPath(new URL('../wrangler.toml', import.meta.url));

let tmpDir;
let tomlPath;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tpd-kv-'));
  tomlPath = join(tmpDir, 'wrangler.toml');
  writeFileSync(tomlPath, readFileSync(realTomlPath, 'utf8'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function run(kvMode) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, KV_FAKE: '1', KV_FAKE_MODE: kvMode, KV_FAKE_TOML: tomlPath },
  });
}

function readToml() {
  return readFileSync(tomlPath, 'utf8');
}

describe('ensure-kv.mjs', () => {
  it('creates namespace and patches a copied wrangler.toml when missing', () => {
    const r = run('list-empty');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(FAKE_ID);
    expect(readToml()).toContain(FAKE_ID);
  });

  it('reuses an existing namespace (idempotent), leaves real config untouched', () => {
    const r = run('list-exists');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(FAKE_ID);
    expect(readToml()).toContain(FAKE_ID);
    expect(readFileSync(realTomlPath, 'utf8')).toContain('<AUTO>');
  });
});