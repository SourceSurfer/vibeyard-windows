# Vibeyard for Windows

> A community fork of [**Vibeyard**](https://github.com/elirantutia/vibeyard) — the IDE for AI coding agents — with a working Windows build pipeline and an opt-in approach to global Claude Code hooks.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-elirantutia%2Fvibeyard-blue)](https://github.com/elirantutia/vibeyard)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2B%20%7C%20macOS%20%7C%20Linux-lightgrey)](#supported-platforms)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)](.nvmrc)

</content>
## What is this fork?

[Vibeyard](https://github.com/elirantutia/vibeyard) is an Electron-based IDE that wraps multiple AI coding agent sessions (Claude Code, OpenAI Codex CLI, Gemini CLI) into a single workspace with PTY-based terminals, multi-session management, cost tracking, and an embedded browser tab with element-inspect-to-edit capability.

The upstream project ships official builds for **macOS** and **Linux** only. The build pipeline assumes a Unix shell, the runtime hook system is hard-wired to `sh -c '... /usr/bin/python3 ...'`, and the global `~/.claude/settings.json` is rewritten on every launch — none of which works cleanly on Windows.

This fork makes Vibeyard build, run, and distribute on **Windows 10/11 and Windows Server 2022+** without forking away from the upstream architecture, so changes can be contributed back as focused pull requests.

## What's different from upstream

| Area | Upstream | This fork |
|---|---|---|
| Windows build | Not supported | NSIS installer + portable `.exe` via `electron-builder` |
| `copy-assets` script | Bash (`cp`/`rm`/`mkdir`) | Cross-platform Node script (`scripts/copy-assets.mjs`) |
| `postinstall` script | Bash (`test -f && \|\| true`) | Cross-platform Node script (`scripts/postinstall.mjs`) |
| `electron-builder` binaries | Fetched directly from GitHub Releases | Auto-resolved via `scripts/setup-binaries.mjs` (mirror-aware, chunked download) |
| Global hooks in `~/.claude/settings.json` | Installed automatically on every launch | **Opt-in** via Preferences → "Install Claude Code hooks" (default: disabled) |
| `pty-manager` shell on Windows | Falls through to default | Uses `cmd.exe`, propagates `USERPROFILE` alongside `HOME` |
| Binary search paths on Windows | `~/.local/bin`, `~/.npm-global/bin` | Adds `%APPDATA%\npm`, WinGet, `Program Files\nodejs` |
| `PATH` separator handling | Hard-coded `:` | Uses `path.delimiter` |
| `app-builder-lib` patches for Windows builds | N/A | Applied automatically via `patch-package` |

All changes are additive — `darwin` and `linux` code paths are untouched, and the existing 826 upstream tests still pass alongside 17 new ones for the Windows-specific code.

</content>
## Supported platforms

| Platform | Status | Notes |
|---|---|---|
| **Windows 10 (1809+)** | ✅ Tested | ConPTY required, ships in 1809+ |
| **Windows 11** | ✅ Tested | Primary development target |
| **Windows Server 2022+** | ✅ Tested | |
| **macOS** | ✅ Compatible (upstream) | All upstream code paths preserved; use upstream releases |
| **Linux** | ✅ Compatible (upstream) | Same |

## Prerequisites (Windows)

- **Node.js v24+** (see `.nvmrc`)
- **Visual Studio 2022 Build Tools** with the *Desktop development with C++* workload — required to compile `node-pty` against ConPTY
- **Python 3.x** — required by `node-gyp`
- **Git for Windows** — for `git clone`
- *Optional:* **Developer Mode** (`Settings → System → For developers`) — lets `npm install` create symlinks without administrator rights
- *Optional:* **7-Zip** — only if your Windows version is older than 10 1803 (which lacks the bundled `tar.exe` used to unpack `electron-builder` native binaries)

## Quick start

```cmd
git clone https://github.com/SourceSurfer/vibeyard-windows.git
cd vibeyard-windows
npm install
npm start
```

The `postinstall` step automatically applies the bundled `app-builder-lib` patches via `patch-package`, so no manual fixup is required.

</content>
## Behind a restrictive network

If you are working from a region where direct connections to `registry.npmjs.org`, `github.com`, or large CDN downloads are unstable (DPI throttling, connection resets after a few MB), this fork ships two affordances out of the box:

1. **`.npmrc`** is preconfigured to use the [`npmmirror.com`](https://npmmirror.com) mirror as the default registry, plus mirror entries for `electron` and `electron-builder-binaries`. No environment variables needed.
2. **`scripts/download-chunked.mjs`** is a Range-request HTTP downloader with retry logic, designed to survive TLS resets after ~3 MB. It's invoked automatically by `scripts/setup-binaries.mjs` during `npm run dist` to fetch native `electron-builder` binaries (NSIS, winCodeSign) from the mirror in small chunks.

If your network is unrestricted, both of these are still no-ops on the happy path — they only matter when downloads start failing.

## Build a Windows distribution

```cmd
npm run dist
```

The `predist` hook (`scripts/setup-binaries.mjs`) ensures the `electron-builder` cache contains everything it needs, then `electron-builder` produces:

```
dist/Vibeyard-0.2.23-x64.exe           ← NSIS installer
dist/Vibeyard-0.2.23-x64-portable.exe  ← single-file portable
```

A clean rebuild from `npm install` to a finished `.exe` takes roughly **3 minutes** on a typical Windows developer machine with the prerequisites already installed.

## Hooks: opt-in behavior

Vibeyard's UI features (live session status, cost tracking, context window meter, missing-tool detection) rely on Claude Code hooks installed into the **global** `~/.claude/settings.json`. The upstream implementation writes around 60 KB of `sh -c '... python3 ...'` hooks on every launch and overwrites your `statusLine` setting.

On Windows this is problematic for three reasons:

1. The hook scripts use `sh` and `/usr/bin/python3`, which only exist if Git Bash and a Unix-style Python are present in `PATH`. Even then, they fail with status 127 because `/usr/bin/python3` is a Unix path.
2. The hooks are installed into the **global** scope, so they affect every project where you use Claude Code, not only those opened through Vibeyard.
3. Failing hooks generate `Stop hook error` noise in every Claude Code response.

This fork makes hook installation **opt-in**:

- A new preference `installClaudeHooks` (`enabled` / `disabled`) lives in Vibeyard's state. Default: **`disabled`**.
- When disabled, `installHooksOnly()` and `installStatusLine()` short-circuit and additionally call `cleanupVibeyardHooks()`, which removes any previously-installed `# vibeyard-hook`-marked entries from `~/.claude/settings.json` without touching foreign hooks or your other settings.
- The toggle is exposed in **Preferences → General → Install Claude Code hooks**. Switching it on installs the hooks immediately; switching it off cleans them up immediately.
- The "Fix" button on the readiness banner still force-installs the hooks (it's an explicit user action), so existing UX flows are preserved.

If you don't need cost/status indicators in Vibeyard's sidebar, leave the toggle off — Vibeyard works fine without the hooks. PTY sessions, multi-session management, the embedded browser tab with element inspection, and everything else are fully functional regardless.

</content>
## Project layout

```
src/
├── main/         Node.js side: PTY, IPC, providers, settings guard
├── preload/      contextBridge — exposes window.vibeyard API
└── renderer/     vanilla TypeScript + xterm.js UI

scripts/
├── copy-assets.mjs       Cross-platform asset copy (replaces bash cp/rm/mkdir)
├── postinstall.mjs       Cross-platform postinstall (replaces bash test)
├── download-chunked.mjs  Range-request HTTP downloader for restrictive networks
├── setup-binaries.mjs    Idempotent electron-builder native binary fetcher
└── generate-ico.mjs      Builds build/icon.ico from icon.png (no extra deps)

patches/
└── app-builder-lib+26.8.1.patch    Windows workarounds for winCodeSign symlinks
                                     and rcedit-x64.exe lookup

build/
├── icon.png      Source icon
├── icon.icns     macOS icon (upstream)
└── icon.ico      Windows icon (this fork)
```

The TypeScript source under `src/` follows a strict three-process Electron architecture with context isolation. See `CLAUDE.md` for the upstream architecture overview written by the original author.

## Testing

```cmd
npm test                  ::  843/843 passing
npm run test:watch
npm run test:coverage
```

The new Windows-specific code paths in `src/main/providers/resolve-binary.ts`, `src/main/pty-manager.ts`, `src/main/claude-cli.ts`, `src/main/settings-guard.ts`, and `src/main/store.ts` are covered by 17 dedicated test cases that mock `process.platform`, `os.homedir()`, and the file system. No upstream tests were modified beyond mock setup.

</content>
## Known limitations

- **Code signing.** Builds are unsigned. The auto-updater works but Windows SmartScreen will warn on first run. For production distribution you need a code-signing certificate (free options exist for open-source projects through SignPath; commercial certs from Sectigo, DigiCert, etc.).
- **Live status hooks.** When `installClaudeHooks` is left at the default `disabled`, the live cost meter, context window indicator, and missing-tool detector stay inactive. PTY sessions and the rest of the IDE work as normal. A cross-platform Node-based hook helper is on the roadmap (see [Roadmap](#roadmap)).
- **Reinstall + preference flip.** The "Force Install" code path used by the readiness banner installs the hooks but does not currently flip the `installClaudeHooks` preference to `enabled`, so on the next launch the cleanup sweeps them back out. Avoid the readiness banner's "Fix" button until this is patched, or toggle the preference manually in Preferences first.
- **macOS-only menu items** (Hide, Services, etc.) are omitted from the Windows menu.

## Roadmap

- [ ] **Cross-platform hook helper.** Replace the inline `sh -c '... python3 ...'` hook scripts with a small Node helper (`scripts/hook-helper.mjs`) that reads stdin JSON and writes the status files. Eliminates the dependency on `sh` and `/usr/bin/python3` entirely, benefits Linux and macOS users without those tools too.
- [ ] **Sync `installClaudeHooks` on force install.** Make `reinstallSettings()` flip the preference to `enabled` atomically with the hook write, so the readiness banner's "Fix" button has lasting effect.
- [ ] **Local-scope hook installation option.** Allow Vibeyard to install its hooks into `<project>/.claude/settings.local.json` instead of the global file, so they only fire when working on the Vibeyard-managed project.
- [ ] **Upstream contribution.** Submit focused pull requests for the cross-platform improvements (build pipeline, win32 branches, opt-in toggle) back to [`elirantutia/vibeyard`](https://github.com/elirantutia/vibeyard). Restrictive-network shims (`.npmrc` mirror, `download-chunked.mjs`) stay in this fork.

## Contributing

Pull requests are welcome — both for the Windows-specific improvements in this fork and for additional cross-platform fixes that could feed back into upstream.

If your change is genuinely cross-platform, please consider submitting it to [upstream](https://github.com/elirantutia/vibeyard) directly — this fork's purpose is to be as small a delta as possible, not to compete with the original project.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the upstream contribution guidelines (commit format, code of conduct, etc.) which apply here too.

</content>
## Acknowledgments

All credit for the original Vibeyard architecture, UI, session inspector, browser tab feature, P2P sharing, and the entire upstream codebase goes to **[Eliran Tutia](https://github.com/elirantutia)** and the upstream contributors. This fork only adds the Windows build pipeline, the opt-in hook toggle, and a few network-resilience helpers — every line of meaningful product logic is theirs.

If you find this fork useful, please **also star [the upstream project](https://github.com/elirantutia/vibeyard)**. The work this fork builds on is far larger than the work this fork adds.

## License

This project remains licensed under the [MIT License](LICENSE), with the original copyright held by Eliran Tutia. All modifications in this fork are released under the same MIT terms.

---

<sub>Vibeyard is an independent project and is not affiliated with or endorsed by Anthropic, OpenAI, or Google.</sub>
</content>