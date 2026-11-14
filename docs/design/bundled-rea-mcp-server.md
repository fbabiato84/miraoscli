# Bundled REA reverse-engineering server

[English](bundled-rea-mcp-server.md) | [简体中文](bundled-rea-mcp-server.zh-CN.md)

## Problem

The `rea` skill (Reverse Engineer Anything) drives an MCP server that the user
must install separately. Until it is registered, the skill instructs the agent
to stop, so a fresh install has the documentation but no engine: `analyze-*`
tools are unavailable and every reverse-engineering request ends at an install
step.

## Current state

- `rea` and `rea-install` are bundled skills under
  `packages/core/src/skills/bundled/`.
- No `mcpServers.rea` entry ships with the CLI, so the engine is never
  registered.
- The CLI already has a precedent for a bundled server: Mem0 is built by
  esbuild into `dist/mem0/main.js` and registered at the top tier by
  `createBundledMem0Server`.

## Goals

- A source install ends with a working `rea` MCP server, with no manual step.
- No per-call approval and no settings entry required.
- An install that cannot carry the engine still produces a working CLI.

## Non-goals

- Publishing the engine inside the npm package. `scripts/prepare-package.js`
  rejects a package above 160 MB unpacked; REA alone is 189,641,205 bytes
  across 10,585 files.
- Vendoring the REA source tree and building it locally. `tsc` over that tree
  did not finish in 55 minutes on the development machine, and the checkout
  needs a 723 MB development install to try.

## Proposed solution

`vendor/rea` holds the published `rea-agents@6.9.0` package — the compiled
output the REA project releases — materialized by `scripts/build-rea.js`:

1. `npm pack rea-agents@6.9.0` into a staging directory, extract it, and move
   `package/` to `vendor/rea`.
2. `npm install --omit=dev --omit=optional --ignore-scripts` inside
   `vendor/rea`.
3. Verify `node scripts/rea.mjs --version`.

The script is wired into `npm run build`, so `npm install` on a fresh clone
(which runs `prepare` → `build` → `bundle`) materializes it. It never fails the
build: on any error it warns and exits 0, leaving the server unregistered.

Step 2 runs on every invocation, not only when `node_modules` is missing. REA's
published manifest declares no `devDependencies`, so a `npm ci` run inside
`vendor/rea` produces a tree that cannot be told apart by name — only by size,
roughly 600 MB larger. Reconciling unconditionally is the one check that holds
however the directory got populated.

`packages/cli/src/config/rea-settings.ts` resolves the entry and builds the
server config:

1. `REA_MCP_ENTRY` — explicit override for a checkout outside the repository.
2. Walk up from the working directory and from the module until
   `vendor/rea/scripts/rea.mjs` exists.

`loadCliConfig` registers the result in `topTierMcpServers` as `rea`, beside
`--mcp-config`.

## Design decisions

- **Published tarball, not a local source build.** The tarball carries the same
  compiled output the project publishes, and it materializes in seconds instead
  of hours.
- **`vendor/` is generated and git-ignored.** Committing 190 MB (plus a 95 MB
  dependency tree) would permanently inflate every clone; `build-rea.js` can
  recreate it from a pinned version.
- **Top tier, not settings.** A settings or `.mcp.json` entry of the same name
  must not demote the bundled engine, and the project/workspace approval gate
  must not hold it: the binary is the one this CLI shipped with, not
  configuration a repository authored. This matches how Mem0 is registered.
- **Always registered.** The user chose plug-and-play over opt-in.
- **`trust: true`.** Analysis tools are usable without a per-call prompt; the
  REA skill's own rules, not the MCP gate, govern what may be inspected.
- **Graceful absence.** A missing runtime leaves the server unregistered rather
  than failing startup, so upstream checkouts and offline installs are
  unaffected.

## Constraints

- REA requires Node `^22.23.4`, `^24.22.1` or `>=26.12.1`; the CLI's own floor
  is lower, so an older Node registers a server that exits during admission.
- First materialization needs network access and ~285 MB of disk (190 MB
  package, 95 MB dependencies).
- Native binary analysis additionally needs a decompiler the user installs
  separately (Ghidra, IDA, Hopper or Kuna).

## Risks

- **Pinned version drift.** The MCP tool catalog changes between REA releases;
  `REA_VERSION` is bumped deliberately and `REA_MCP_ENTRY` allows testing a
  newer checkout without a release.
- **Silent degradation.** A failed fetch leaves no server and only a warning.
  `npm run build:rea` is the documented repair, and `/rea-install` explains it.

## Validation

- `packages/cli/src/config/rea-settings.test.ts` (7 cases) covers override
  precedence, a missing override, the vendored walk-up from a workspace anchor
  and from the esbuild `dist/chunks/` anchor, and the no-runtime case.
- The vendored entry was probed over stdio: `initialize` plus `tools/list`
  returned 255 tools (for example `annotate_native_function`), and the same
  handshake through `createMcpClient` connected in ~0.7 s.
- `node scripts/build-rea.js` reports `vendored REA 6.9.0 is ready`; a forced
  cold run (`--force`) fetched the tarball, installed dependencies and verified
  the entry in 25 s, leaving a 160.0 MB / 10,605-file tree.
- A sentinel package planted in `vendor/rea/node_modules` was pruned by the
  reconciliation step, and the runtime still answered `tools/list` with 255
  tools afterwards.
- `tsc --build` for `packages/cli`, ESLint and Prettier on the changed files,
  and `rea-settings.test.ts` + `config.test.ts` (598 tests) pass.
- Loading the real config (`loadCliConfig`) registers exactly one server, `rea`,
  pointing at `vendor/rea/scripts/rea.mjs`.

## Acceptance criteria

- After `npm install` on a fresh clone, `/mcp` lists `rea` with its tools.
- `npm run build` on a checkout without `vendor/rea` still succeeds and starts.
- The server never falls behind a user-authored `rea` entry, and no approval
  dialog gates it.

## Follow-ups

- Native decompiler detection is left to `rea doctor`; surfacing its result at
  startup is not implemented.
- Publishing the engine inside the npm package needs either a trimmed REA subset
  or a raised size gate in `scripts/prepare-package.js`; neither is attempted.
