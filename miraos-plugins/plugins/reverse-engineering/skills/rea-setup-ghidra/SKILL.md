---
name: rea-setup-ghidra
description: Set up the local REA reverse-engineering engine (rea-agents) and Ghidra for MiraOS — clone, install, register the MCP server, and verify native binary analysis works. Run once before using the reverse-engineering skill on native binaries.
disable-model-invocation: true
user-invocable: true
---

# Set up REA + Ghidra

This is the one-time setup for the `reverse-engineering` skill. It installs the
REA engine, clones/verifies the upstream, and wires up Ghidra for native binary
analysis. It does not install anything without explicit confirmation.

## What this does

- REA (`rea-agents`, MIT, https://github.com/morluto/rea) is a local
  reverse-engineering engine exposed as an MCP server. This plugin already
  declares the `rea` MCP server (npx -y rea-agents@latest mcp); this skill makes
  sure the runtime is present and, for native binaries, that a decompiler
  (Ghidra) is configured.
- All analysis runs locally. Runtime capture executes the target with the user's
  own OS permissions.

## Steps

1. If shell execution is sandboxed, tell the user to run setup on the host and
   stop.

2. Without editing them, check: whether Node.js >= 22.23.4 (or 24.x / 26.x) and
   `npm`/`npx` are available; whether a decompiler is already installed
   (`ghidraRun`/`analyzeHeadless` on PATH, or Ghidra at a known path; IDA/Hopper
   also work); and whether the `rea` MCP server is already registered.

3. Tell the user that continuing may: download the `rea-agents` npm package on
   first use; register the `rea` MCP server (already declared by this plugin);
   and, if they want native binary analysis, require Ghidra (free —
   https://ghidra-sre.org) which REA can auto-launch after approval. Use
   `ask_user_question` with options `Set up REA` and `Cancel`; write it in the
   user's language and do not mark either as recommended. Continue only on
   `Set up REA`.

4. Verify the engine runs:

   ```bash
   npx -y rea-agents@latest --version
   npx -y rea-agents@latest providers --json
   ```

   If `--version` fails, report the error and stop.

5. Confirm the `rea` MCP server is registered. This plugin's `plugin.json`
   declares it, so installing the plugin is enough. If it is missing, add this to
   `~/.qwen/settings.json` under `mcpServers` (preserve existing entries):

   ```json
   "rea": { "command": "npx", "args": ["-y", "rea-agents@latest", "mcp"], "trust": true }
   ```

6. For native binaries, guide the user to install Ghidra (free) and confirm
   REA can see it:

   ```bash
   npx -y rea-agents@latest doctor --provider ghidra --json
   ```

   If no decompiler is installed, tell the user REA still covers JS/Electron,
   websites, .NET, Android (headless JADX + a JDK), WASM, firmware and other
   static formats without Ghidra.

7. Tell the user to restart MiraOS so the MCP server loads, then stop.

Do not run REA analysis on any target the user is not authorized to inspect.
Reverse engineering is governed by local law, software licenses and terms of
service.
