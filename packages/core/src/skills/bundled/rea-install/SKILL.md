---
name: rea-install
description: Check that the REA reverse-engineering engine bundled with this CLI is present and working, and repair the install when it is not.
disable-model-invocation: true
user-invocable: true
---

# Set up REA (reverse engineering engine)

REA ships with this CLI. The `rea` MCP server is registered at startup from
`vendor/rea`, which `scripts/build-rea.js` materializes during `npm run build`
(see `packages/cli/src/config/rea-settings.ts`). This skill only repairs an
install where that runtime is missing or broken — it does not install a second
copy of anything.

## Check

1. Confirm the `rea` server is listed by `/mcp`. If it is, REA is ready; stop.
2. If it is not, find which piece is missing:

   ```bash
   node vendor/rea/scripts/rea.mjs --version
   ```
   - Command not found → `vendor/rea` was never materialized.
   - Module error about a missing dependency → its `node_modules` is incomplete.
   - Runtime admission error → the Node running the CLI is too old; REA
     requires Node `^22.23.4`, `^24.22.1` or `>=26.12.1`.

## Repair

Run from the repository root, then restart the session so the server is picked
up:

```bash
npm run build:rea
```

That fetches the pinned `rea-agents` release, installs its runtime dependencies
and verifies the entry starts. Add `-- --force` to refetch when the vendored
copy is corrupt or the pinned version changed.

To use a REA checkout outside this repository instead, set `REA_MCP_ENTRY` to
its `scripts/rea.mjs` and restart.

## Native binary analysis

REA still needs a decompiler you install separately (Ghidra is free:
https://ghidra-sre.org). Without one, REA covers JS/Electron, websites, .NET,
Android (headless JADX), WASM, firmware and other static formats. Verify what
this machine has with:

```bash
node vendor/rea/scripts/rea.mjs doctor
```

Do not run REA analysis on a target the user is not authorized to inspect.
Reverse engineering is governed by local law, licenses and terms of service.
