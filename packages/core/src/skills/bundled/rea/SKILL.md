---
name: rea
description: Reverse-engineer a local target (native binary, desktop/electron app, website, .NET assembly, Android APK, WASM, firmware) and rebuild the feature in the user's project. Drives the REA MCP engine for evidence-backed analysis and the craft-anything reconstruct-and-verify loop. Use when the user asks how something works inside a program, app, or site they own or are allowed to inspect, or to clone/reimplement its behavior.
when_to_use: When the user wants to understand, trace, document, or reimplement the behavior of a program, app, website, or binary they own or are authorized to analyze - e.g. "how does search work in this app", "decompile this and rebuild X", "what does this binary do", "clone this site's feature".
allowedTools:
  - read_file
  - run_shell_command
---

# REA: Reverse Engineer Anything

Use this skill to investigate a local target and reconstruct a feature from it.
REA is a local engine (MCP server named `rea`) that inspects a target and
returns findings **with evidence** - pseudocode, assembly, strings, symbols,
imports, IPC, routes, network traffic, screenshots - plus explicit unknowns. You
turn that evidence into an explanation and a working reimplementation.

If the `rea` MCP tools are not available, stop and run `/rea-install` first (or
tell the user to). Do not guess at a binary's behavior without evidence.

## Ground rules

- Only analyze a target the user owns or is explicitly allowed to inspect.
  Reverse engineering is governed by law, licenses and terms of service.
- Every claim about the target's behavior must trace to evidence REA returned.
  Mark anything inferred or unverified as such.
- All analysis is local. Runtime capture executes the target with the user's
  own OS permissions - say so before triggering it.

## Investigation workflow

1. **Frame the question.** Name the target (absolute path) and the specific
   behavior to recover. Pick the right tool for the target kind:
   - Native binary / desktop app → `open_binary` (pseudocode, asm, symbols).
   - JavaScript / Electron app → `analyze-javascript-application` (modules,
     imports, source maps, routes, IPC, native add-ons).
   - Website → website inspection (page structure, scripts, network,
     screenshots) with a Chrome-family browser.
   - .NET assembly → static metadata + CIL (no native engine needed).
   - Android APK → headless JADX (needs a JDK); `adb` for a live device.
   - Saved capture → HAR / Fiddler SAZ for network behavior.
   - WASM, Godot PCK, Unity IL2CPP, PyInstaller, Go/Rust → static formats.

2. **Inspect.** Open the target and let REA return the relevant code region and
   its references. Prefer the narrowest call that answers the question.

3. **Trace.** Follow the data flow the evidence shows: entry point → the
   functions/handlers it calls → where the observable behavior is produced.
   For native code, read the pseudocode, not just the assembly. When a provider
   is ambiguous, pick one explicitly: `open_binary { "path": "...",
"provider_id": "ghidra" }` (also `ida`, `hopper`, `kuna`).

4. **Explain with evidence.** For each claim, cite what REA returned (function,
   file:line, address, log line). List the unknowns REA flagged. Do not fill
   gaps by assumption; if a detail is unknown, say so and, if possible, ask REA
   a narrower follow-up to resolve it.

## Craft anything (reconstruct and verify)

When the user wants the behavior rebuilt in their project:

1. **Specify.** Write a short spec of the recovered feature from the evidence:
   inputs, outputs, the algorithm or protocol, and the observable behavior that
   defines "correct". Keep it to what the evidence supports.

2. **Implement.** Build the feature in the user's project, following the
   project's language, conventions and structure. Reimplement the behavior;
   do not copy original assets, code, or data the user is not licensed to use.

3. **Verify against the original.** Prove equivalence with a test the original
   can also satisfy - the same inputs producing the same outputs. Where REA can
   compare against the original (e.g. recovered constants, byte layouts, request
   shapes), do so and report the match. State plainly what was verified and what
   remains inferred.

## Notes

- Large binaries may need more startup time; REA exposes per-provider timeouts.
- Static JS/.NET analysis reads files without running the app; only runtime
  capture executes it.
- Report findings as evidence + limitations, never as bare conclusions.
