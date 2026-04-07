# Windows Port — Technical Notes

This document describes the technical changes made to enable Windows support for Vibeyard. It is intended for contributors who want to understand *why* each change exists, and for anyone preparing upstream pull requests.

## Goals

1. Make `npm install`, `npm run build`, `npm test`, `npm start`, and `npm run dist` succeed on a clean Windows 10/11 machine with the documented prerequisites.
2. Add no new runtime dependencies beyond `patch-package` (a `devDependency`).
3. Touch the upstream source as little as possible — additive `if (process.platform === 'win32')` branches only, no refactors of existing `darwin`/`linux` paths.
4. Keep every existing test passing, and add focused tests for each new branch.
5. Stay PR-ready: every isolated change should be small enough to submit upstream as a focused pull request.

## Architecture context

Vibeyard is a three-process Electron application:

- **Main** (`src/main/`) — Node.js. Window lifecycle, PTY management via `node-pty`, IPC, file system, persistent state in `~/.vibeyard/state.json`. CLI tool integration goes through a provider abstraction (`src/main/providers/`) so new agents can be plugged in without touching the rest of the codebase.
- **Preload** (`src/preload/preload.ts`) — `contextBridge` that exposes the `window.vibeyard` API to the renderer with strict context isolation.
- **Renderer** (`src/renderer/`) — Vanilla TypeScript with xterm.js. No frontend framework. Components subscribe to a singleton `AppState` event emitter.

The renderer is bundled by `esbuild` (IIFE, browser target). The main and preload processes are compiled by `tsc` (CommonJS). Each process has its own `tsconfig.*.json`.

</content>
### `renderer/components/file-reader.ts` — cross-platform path resolution

The read-only file viewer pane (used by the Commands, Agents, Skills, and MCP sidebar items) had a `resolveFilePath` helper that only recognised POSIX absolute paths via `filePath.startsWith('/')`. On Windows the sidebar passes already-absolute paths like `C:\Users\name\project\.claude\commands\fix-css.md`, which fall through that check and get concatenated onto `project.path` with a forward slash, producing a double-rooted unreadable path. `fs.readFile` then throws and the viewer just shows an empty body.

Replaced with a small `isAbsolutePath` helper that accepts:

- POSIX absolute: `/home/user/...`
- Windows drive-letter: `C:\...`, `C:/...`, etc. (regex `^[A-Za-z]:[\\/]`)
- Windows UNC: `\\server\share\...`

The relative-path join now picks `\` or `/` based on the existing separator in `project.path`, so Windows projects stay on backslashes and POSIX projects stay on forward slashes.

This bug also exists in upstream — it just never surfaces on macOS/Linux because no upstream user has a project root that fails the POSIX check. Worth a focused upstream PR.

## Build pipeline changes

### `scripts/copy-assets.mjs` (new — replaces inline bash)

Upstream `package.json` shipped a `copy-assets` step written as inline bash with `cp -r`, `rm -rf`, and `mkdir -p`. None of these exist on a clean Windows shell. Replaced with a Node script using `fs.cpSync(..., { recursive: true, force: true })`. Cross-platform, zero new dependencies.

### `scripts/postinstall.mjs` (new — replaces inline bash)

The upstream `postinstall` was `[ -f patches/... ] && npx patch-package || true`. Translated literally to Node: `fs.existsSync` → conditional `child_process.spawnSync('npx', ['patch-package'], { stdio: 'inherit', shell: true })`. The `shell: true` flag is required so Windows resolves `npx.cmd` from `PATH` correctly.

### `scripts/setup-binaries.mjs` (new)

`electron-builder` downloads three native helper packages on first build: `nsis-3.0.4.1`, `nsis-resources-3.4.1`, `winCodeSign-2.6.0`. Upstream relies on `electron-builder`'s built-in fetcher, which goes directly to GitHub Releases — frequently TLS-reset by DPI in some regions after 2–3 MB.

This script:

1. Resolves the cache directory (`%LOCALAPPDATA%\electron-builder\Cache` on Windows, `~/.cache/electron-builder` on Linux/macOS).
2. Checks whether each expected subdirectory already exists. Idempotent — re-running it after a successful fetch is a no-op.
3. If missing, calls `download-chunked.mjs` to fetch the archive from a configurable mirror, then extracts via the bundled Windows `tar.exe` (1803+) or `7z` as a fallback.
4. Runs as the `predist` hook so it always executes before `electron-builder` itself.

### `scripts/download-chunked.mjs` (new)

A small HTTP downloader that:

- Issues a `HEAD` first to learn `Content-Length`.
- Downloads in `Range: bytes=N-M` chunks of 1 MB by default.
- Retries each chunk up to 5 times with exponential backoff.
- Resumes from the last successful byte instead of restarting on TLS reset.
- Uses Node's built-in `https` module — no `axios`, no `node-fetch`, no new dependency.

This is what makes `npm run dist` reliable on connections that drop after a few MB.

### `scripts/generate-ico.mjs` (new)

`electron-builder` requires a multi-resolution `.ico` for Windows installers. Upstream only ships `.icns` (mac) and `.png` (linux). Rather than add an `ico` library to dependencies, this script shells out to ImageMagick if present, with a fallback to a pure-Node ICO writer that packs 16/32/48/64/128/256 PNG frames into the ICO container format.

### `patches/app-builder-lib+26.8.1.patch`

Two narrow fixes against `app-builder-lib@26.8.1`:

1. **`winCodeSign` symlink handling.** The unpack step calls `fs.symlinkSync` unconditionally for symlink entries inside the archive. Without Developer Mode (or admin rights), this throws `EPERM` on Windows. Patch wraps the call in `try/catch` and falls back to `fs.copyFileSync` when symlink creation fails — exactly the same fallback `electron-builder` already has for other archives.
2. **`rcedit-x64.exe` lookup.** The resolver looked in a hard-coded path that no longer matches the layout shipped by `app-builder-bin@5`. Patch updates the path to the current location.

Both patches are applied automatically by `patch-package` from `postinstall`. Upstream PRs are recommended for both.

## Runtime changes (`src/main/`)

### `pty-manager.ts` — Windows shell selection

Added a `process.platform === 'win32'` branch to `spawnPty()`:

```ts
const shell = process.platform === 'win32'
  ? (process.env.COMSPEC || 'cmd.exe')
  : (process.env.SHELL || '/bin/sh');
```

The environment passed to the PTY now propagates `USERPROFILE` alongside `HOME`, because most CLI tools on Windows (including Claude Code) read `USERPROFILE` to locate `~/.claude`.

Tested with `node-pty` v1.1.0 against ConPTY (Windows 10 1809+).

### `providers/resolve-binary.ts` — Windows search paths

Upstream walks a fixed list of Unix paths (`~/.local/bin`, `~/.npm-global/bin`, `/usr/local/bin`, etc.) looking for the CLI executables. On Windows, none of these exist. Added a Windows branch:

```ts
if (process.platform === 'win32') {
  candidates.push(
    path.join(process.env.APPDATA || '', 'npm'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links'),
    path.join(process.env.ProgramFiles || '', 'nodejs'),
  );
}
```

The lookup also tries `${name}.cmd` and `${name}.exe` in addition to the bare name, since global npm shims on Windows are `.cmd` files and WinGet shims are `.exe`.

`PATH` parsing was changed from a hard-coded `':'` split to `path.delimiter`, so the existing PATH-walking code works on both POSIX and Windows.

### `settings-guard.ts` — opt-in hook installation

This is the most behaviour-affecting change in the fork.

Upstream behaviour: on every launch, `installHooksOnly()` overwrites `~/.claude/settings.json` with ~60 KB of `sh -c '... /usr/bin/python3 ...'` hook entries and a `statusLine` setting. The hooks call into Vibeyard's status-file writer to power the live cost meter and context-window indicator in the sidebar.

On Windows the inline `sh` and `/usr/bin/python3` paths fail with status 127 in every Claude Code response, even when Git Bash is on `PATH`, because the embedded path is Unix. Worse, since the hooks are installed into the **global** settings file, every Claude Code project on the machine starts spitting `Stop hook error` noise — not only the one open in Vibeyard.

This fork:

1. Adds a new preference `installClaudeHooks: 'enabled' | 'disabled'` to the persistent state, default `disabled`.
2. Wraps both `installHooksOnly()` and `installStatusLine()` in an early-return guard:
   ```ts
   if (getPref('installClaudeHooks') !== 'enabled') {
     await cleanupVibeyardHooks();
     return;
   }
   ```
3. Adds `cleanupVibeyardHooks()`, which reads `~/.claude/settings.json`, removes any hook whose `command` string contains the `# vibeyard-hook` marker, leaves every other hook untouched, and writes the file back atomically (temp file + rename) only if something changed. Foreign hooks installed by other tools or by the user are never modified.
4. Exposes the toggle in **Preferences → General → Install Claude Code hooks**. Switching it on installs the hooks immediately; switching it off cleans them up immediately.
5. Leaves the readiness banner's "Force Install" path intact — it still installs the hooks unconditionally as an explicit user action. (See "Known limitations" in `README.md` for the caveat.)

Net effect: a user who installs Vibeyard on Windows for the first time gets a clean Claude Code experience by default, with no `Stop hook error` noise in unrelated projects. Users who want the live cost/context indicators flip one preference and get them.

## Tests

17 new test cases covering:

- `pty-manager.test.ts` — `cmd.exe` selection, `USERPROFILE` propagation, `COMSPEC` fallback
- `providers/resolve-binary.test.ts` — Windows path candidates, `.cmd`/`.exe` extension probing, `path.delimiter` use
- `settings-guard.test.ts` — `installClaudeHooks=disabled` short-circuit, `cleanupVibeyardHooks()` selective removal, foreign-hook preservation, idempotent no-op when nothing to clean
- `claude-cli.test.ts` — Windows-specific CLI lookup ordering
- `store.test.ts` — `installClaudeHooks` default value and persistence

All 826 existing upstream tests still pass alongside the new 17. Test suite total: **843/843**.

Tests mock `process.platform`, `os.homedir()`, and `fs` — they run on any host OS, so CI doesn't need a Windows runner to validate the Windows code paths (though one is still recommended for the build pipeline itself).

## What is *not* in this fork

- No code-signing certificate. Builds are unsigned; SmartScreen will warn on first run.
- No cross-platform replacement for the `sh -c '... python3 ...'` hook scripts themselves — only the opt-in toggle that gates whether they get installed at all. A Node-based hook helper is in the roadmap and would benefit upstream macOS/Linux users too.
- No changes to the renderer process. All UI behaviour is identical to upstream.
- No changes to test logic — only new test files and minimal `vi.mock` setup additions where the new code paths needed mockable platform detection.

## Recommended upstream PR sequence

If these changes are submitted upstream, the recommended order of focused PRs is:

1. `scripts/copy-assets.mjs` + `scripts/postinstall.mjs` — pure cross-platform improvements, no behaviour change for existing platforms.
2. `path.delimiter` adoption in `resolve-binary` and PATH-walking code — bug fix, no new feature.
3. Windows branches in `pty-manager.ts` and `resolve-binary.ts` — additive, gated on `process.platform === 'win32'`.
4. `electron-builder` Windows target + `scripts/setup-binaries.mjs` + `scripts/generate-ico.mjs` + `patches/` — the full Windows build pipeline.
5. `installClaudeHooks` opt-in preference — the most discussion-worthy change. Worth proposing as an RFC issue first because it changes default behaviour for everyone, not only Windows.

The restrictive-network helpers (`.npmrc` mirror config, `download-chunked.mjs`) are intentionally **not** in the upstream PR plan — they're specific to certain network environments and don't belong in upstream's defaults.
