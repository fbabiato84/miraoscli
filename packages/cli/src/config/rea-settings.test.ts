/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'node:path';

const fsMocks = vi.hoisted(() => ({ existsSync: vi.fn() }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: fsMocks.existsSync };
});

const { createBundledReaServer, resolveReaEntry } = await import(
  './rea-settings.js'
);

// The bundle anchor is where esbuild hoists this module (`dist/chunks/`), so
// the resolution test walks up from a stand-in for it.
const BUNDLE_DIR = resolve('/repo/dist/chunks');
const WORKSPACE = resolve('/repo/packages/cli');
const REPO = resolve('/repo');
const VENDORED_ENTRY = join(REPO, 'vendor', 'rea', 'scripts', 'rea.mjs');
const EXTERNAL_ENTRY = resolve('/opt/rea/scripts/rea.mjs');

/** Only the listed paths exist; everything else is missing. */
function onlyTheseExist(paths: string[]) {
  const normalized = paths.map((p) => p.replaceAll('\\', '/'));
  fsMocks.existsSync.mockImplementation((candidate: string) =>
    normalized.includes(candidate.replaceAll('\\', '/')),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  fsMocks.existsSync.mockReset();
});

describe('resolveReaEntry', () => {
  it('returns undefined when no REA runtime is installed', () => {
    onlyTheseExist([]);
    expect(resolveReaEntry(REPO)).toBeUndefined();
  });

  it('prefers an explicit REA_MCP_ENTRY', () => {
    onlyTheseExist([EXTERNAL_ENTRY]);
    vi.stubEnv('REA_MCP_ENTRY', EXTERNAL_ENTRY);
    expect(resolveReaEntry(REPO)).toBe(EXTERNAL_ENTRY);
  });

  it('ignores an REA_MCP_ENTRY that does not exist', () => {
    onlyTheseExist([VENDORED_ENTRY]);
    vi.stubEnv('REA_MCP_ENTRY', resolve('/opt/gone/rea.mjs'));
    expect(resolveReaEntry(REPO)).toBe(VENDORED_ENTRY);
  });

  it('finds the vendored checkout above the anchor directory', () => {
    onlyTheseExist([VENDORED_ENTRY]);
    expect(resolveReaEntry(WORKSPACE)).toBe(VENDORED_ENTRY);
  });

  it('finds the vendored checkout when launched from the bundle directory', () => {
    onlyTheseExist([VENDORED_ENTRY]);
    expect(createBundledReaServer(BUNDLE_DIR)).toEqual({
      command: process.execPath,
      args: [VENDORED_ENTRY, 'mcp'],
      trust: true,
    });
  });
});

describe('createBundledReaServer', () => {
  it('returns undefined when REA is not installed', () => {
    onlyTheseExist([]);
    expect(createBundledReaServer(REPO)).toBeUndefined();
  });

  it('spawns the resolved entry over stdio', () => {
    onlyTheseExist([EXTERNAL_ENTRY]);
    vi.stubEnv('REA_MCP_ENTRY', EXTERNAL_ENTRY);
    expect(createBundledReaServer(REPO)).toEqual({
      command: process.execPath,
      args: [EXTERNAL_ENTRY, 'mcp'],
      trust: true,
    });
  });
});
