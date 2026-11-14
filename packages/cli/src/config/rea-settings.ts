/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { MCPServerConfig } from '@qwen-code/qwen-code-core';
import { resolveBundleDir } from '@qwen-code/qwen-code-core/utils/bundlePaths.js';
import { getJsInterpreterCommand } from '@qwen-code/qwen-code-core/utils/runtime-info.js';

/** Name the bundled reverse-engineering server is registered under. */
export const REA_MCP_SERVER_NAME = 'rea';

/** REA CLI entry, relative to the root of a REA checkout. */
const REA_ENTRY_SEGMENTS = ['scripts', 'rea.mjs'];

/** Vendored REA checkout, relative to a repository root. */
const VENDORED_REA_SEGMENTS = ['vendor', 'rea'];

/**
 * Absolute path of the REA CLI entry to spawn, or `undefined` when this build
 * has no REA runtime.
 *
 * Resolution order:
 *
 *   1. `REA_MCP_ENTRY` — explicit override, for a REA checkout outside the repo.
 *   2. `<repo>/vendor/rea/scripts/rea.mjs` — the vendored checkout, found by
 *      walking up from the working directory and from this module's directory.
 *
 * The vendored clone only counts once it is built: `scripts/rea.mjs` imports
 * from `dist/`, so a bare clone would spawn a process that exits immediately.
 * `scripts/build-rea.js` produces that output.
 */
export function resolveReaEntry(
  anchorDir: string = process.cwd(),
): string | undefined {
  const override = process.env['REA_MCP_ENTRY'];
  if (override) {
    const resolved = resolve(override);
    if (existsSync(resolved)) return resolved;
  }

  for (const start of [anchorDir, resolveBundleDir(import.meta.url)]) {
    for (let dir = resolve(start); ; dir = dirname(dir)) {
      const candidate = join(
        dir,
        ...VENDORED_REA_SEGMENTS,
        ...REA_ENTRY_SEGMENTS,
      );
      if (existsSync(candidate)) return candidate;
      if (dirname(dir) === dir) break;
    }
  }
  return undefined;
}

/**
 * The bundled REA MCP server, or `undefined` when no REA runtime is installed.
 *
 * Registered at the top tier (beside `--mcp-config`), so a settings or
 * `.mcp.json` entry of the same name cannot demote it and the
 * project/workspace approval gate never holds it: the binary is the one this
 * CLI ships with, not configuration a repository authored.
 */
export function createBundledReaServer(
  anchorDir: string = process.cwd(),
): MCPServerConfig | undefined {
  const entry = resolveReaEntry(anchorDir);
  if (!entry) return undefined;
  return {
    command: getJsInterpreterCommand(import.meta.url).command,
    args: [entry, 'mcp'],
    trust: true,
  };
}
