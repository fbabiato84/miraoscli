/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Materializes the vendored REA runtime the bundled `rea` MCP server spawns.
 *
 * The CLI resolves REA at `vendor/rea/scripts/rea.mjs` (see
 * `packages/cli/src/config/rea-settings.ts`), and that entry imports from
 * `vendor/rea/dist/`. `vendor/rea` is generated rather than committed: it is a
 * ~190 MB, 10k-file package, and building it from the REA source tree takes
 * hours on a developer machine. The published tarball carries the same
 * compiled output the REA project releases, so this script fetches that pinned
 * version and installs its runtime dependencies.
 *
 * Wired into `npm run build`, so an install on a machine with no `vendor/rea`
 * still ends with a working server. The step never fails the build: REA needs
 * network access and ~200 MB of disk, and a checkout that cannot have them
 * should still get a working CLI — the server simply stays unregistered.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reaDir = join(root, 'vendor', 'rea');
const entry = join(reaDir, 'scripts', 'rea.mjs');

/** Pinned REA release. Bump deliberately: the MCP tool catalog changes with it. */
const REA_VERSION = '6.9.0';

const force = process.argv.includes('--force');

function run(command, args, cwd, label) {
  console.log(`rea: ${label}`);
  // `npm` is a `.cmd` on Windows, which only the shell can start. Passing the
  // whole line with an empty args array — rather than args alongside
  // `shell: true` — is what keeps Node from warning about unescaped arguments
  // (DEP0190).
  const useShell = process.platform === 'win32';
  const result = spawnSync(
    useShell ? [command, ...args.map((arg) => `"${arg}"`)].join(' ') : command,
    useShell ? [] : args,
    {
      cwd,
      stdio: 'inherit',
      shell: useShell,
    },
  );
  if (result.error) {
    console.warn(`rea: ${label} could not start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.warn(`rea: ${label} exited with status ${result.status}.`);
    return false;
  }
  return true;
}

function skip(message) {
  console.warn(
    `rea: ${message}\n` +
      `rea: the bundled \`rea\` MCP server will stay unregistered. Retry with\n` +
      `rea:   npm run build:rea\n` +
      `rea: or point REA_MCP_ENTRY at a REA checkout's scripts/rea.mjs.`,
  );
  process.exit(0);
}

function fetchRea() {
  const staging = mkdtempSync(join(tmpdir(), 'rea-vendor-'));
  try {
    if (
      !run(
        'npm',
        [
          'pack',
          `rea-agents@${REA_VERSION}`,
          '--silent',
          '--pack-destination',
          staging,
        ],
        staging,
        'downloading',
      )
    ) {
      return false;
    }
    const tarball = join(staging, `rea-agents-${REA_VERSION}.tgz`);
    if (!existsSync(tarball)) {
      console.warn(`rea: npm pack did not produce ${tarball}.`);
      return false;
    }
    if (!run('tar', ['-xzf', tarball, '-C', staging], staging, 'extracting')) {
      return false;
    }
    rmSync(reaDir, { recursive: true, force: true });
    cpSync(join(staging, 'package'), reaDir, { recursive: true });
    return true;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (force || !existsSync(entry)) {
  if (!fetchRea()) skip('could not fetch the REA package.');
}

// Reconciled on every run, not only when `node_modules` is missing: REA's
// published manifest declares no devDependencies, so a `npm ci` inside
// `vendor/rea` installs a tree that cannot be told apart by name — it is simply
// ~600 MB larger. Letting `npm install --omit=dev` prune it is the one check
// that holds however the directory got populated.
if (
  !run(
    'npm',
    [
      'install',
      '--omit=dev',
      '--omit=optional',
      // REA's own `prepare` patches dev-only packages it does not ship; run
      // without it, since this install exists only to populate node_modules.
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    reaDir,
    'installing runtime dependencies',
  )
) {
  skip('dependency install failed.');
}

if (!existsSync(entry)) skip('the REA entry is missing.');

const check = spawnSync(process.execPath, [entry, '--version'], {
  cwd: reaDir,
  encoding: 'utf8',
});
if (check.status !== 0) {
  skip('the vendored REA runtime does not start.');
}

console.log(
  `rea: vendored REA ${check.stdout.trim() || REA_VERSION} is ready.`,
);
