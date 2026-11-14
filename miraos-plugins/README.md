# MiraOS Plugins

Claude-format marketplace for MiraOS. **Already registered** as a local source in
`~/.qwen/extensions/marketplaces.json`, so after restarting MiraOS it appears
under `/plugins` → Marketplaces with the `reverse-engineering` plugin ready to
install.

## What's inside

```
miraos-plugins/
├─ .claude-plugin/marketplace.json      marketplace "miraos"
├─ plugins/reverse-engineering/
│  ├─ .claude-plugin/plugin.json        skills: ./skills · mcpServers.rea (npx rea-agents mcp)
│  └─ skills/
│     ├─ reverse-engineering/            (enxuta) investigação + craft-anything
│     ├─ reverse-engineer-anything-official/  (oficial, com references/) roteamento completo REA
│     └─ rea-setup-ghidra/               setup do motor + Ghidra (só user)
└─ vendor/rea                            clone do rea-agents 6.9.0 (referência)
```

## Engine

REA (`rea-agents`, MIT, https://github.com/morluto/rea) roda via
`npx -y rea-agents@latest mcp` (runtime pré-compilado, já validado: v6.9.0,
255 MCP tools). Ghidra/IDA/Hopper/Kuna cobrem binários nativos; JS/Electron,
sites, .NET, Android (JADX), WASM e firmware funcionam sem decompiler nativo.

## Uso

1. Reinicie o MiraOS.
2. `/plugins` → aba Marketplaces → instale `reverse-engineering`.
3. (Binários nativos) rode o skill `rea-setup-ghidra` para apontar o Ghidra.

## Registro manual (se precisar)

```
/extensions sources add C:\Users\Antonio\Documents\qwen-code-src\miraos-plugins
```

## Legal

Só analise alvos que você possui ou tem autorização explícita. Engenharia
reversa é regida por lei local, licenças e termos de serviço.
