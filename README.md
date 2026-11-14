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
