# MiraOS

MiraOS is an AI-powered coding assistant for the terminal — a rebrand of the Qwen Code CLI with a warm, Claude-inspired color palette.

This repository is the full source build (`packages/*`), refactored from [Qwen Code](https://github.com/QwenLM/qwen-code) to MiraOS: command name `miraos`, product name "MiraOS", and the default color scheme recolored to a Claude (claude.ai) style warm palette.

## Highlights

- **Command:** `miraos`
- **Claude-style palette:**
  - Dark: coral accent `#D97757` on warm charcoal `#262624`
  - Light: terracotta accent `#BD5D3A` on warm ivory `#F0EEE6`

## Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

## Run

```bash
# After building, the launcher is at bin/miraos.cmd (Windows) / bin/miraos (POSIX)
bin/miraos.cmd --version
bin/miraos.cmd --help
```

## Bundled REA engine

The [REA](https://github.com/morluto/rea) reverse-engineering engine (`rea-agents`, MIT) ships with the CLI: it registers itself as a top-tier MCP server named `rea`, so all 255 of its tools are available with no install step. Native binaries go through Ghidra, IDA or Hopper when one is installed; JavaScript/Electron, websites, .NET, Android, WASM and firmware work without a native decompiler.

`vendor/rea/` is generated, never committed — `npm run build` fetches the pinned tarball plus its runtime dependencies through `scripts/build-rea.js`. The step never fails the build: without network or disk the CLI still installs and the server simply stays unregistered. To repair it:

```bash
npm run build:rea            # or, to re-fetch from scratch: npm run build:rea -- --force
```

Set `REA_MCP_ENTRY` to a REA checkout's `scripts/rea.mjs` to use one instead, and run `/mcp` inside the CLI to see the server and its tools.

Only reverse-engineer targets you own or are explicitly authorised to inspect.

## What was rebranded (and what was kept)

Rebranded in this source:

- Command name: `qwen` → `miraos` (yargs `scriptName`, help usage, `--help`/`--version` output)
- Product name in user-facing strings: "Qwen Code" → "MiraOS" (notifications, warnings, tips, update check, etc.)
- Default color scheme (`packages/cli/src/ui/themes/theme.ts`): Claude warm palette (coral `#D97757` accent, warm charcoal `#262624` / ivory `#F0EEE6`)

Kept functional (not renamed — renaming would break auth, model routing, telemetry, or the working environment):

- `QWEN_*` environment variables (e.g. `QWEN_HOME`, `QWEN_*` model/auth/telemetry vars)
- The `~/.qwen` config directory
- Model IDs (`qwen3-coder`, etc.), API endpoints, auth mechanisms
- License headers (`Copyright 2025 Qwen Code`)

## License

Apache-2.0 (preserved from the upstream Qwen Code source).
