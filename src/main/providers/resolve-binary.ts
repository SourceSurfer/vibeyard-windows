import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getFullPath } from '../pty-manager';

const COMMON_BIN_DIRS_UNIX = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  path.posix.join(os.homedir().replace(/\\/g, '/'), '.local', 'bin'),
  path.posix.join(os.homedir().replace(/\\/g, '/'), '.npm-global', 'bin'),
];

const COMMON_BIN_DIRS_WIN32 = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe'),
  'C:\\Program Files\\nodejs',
];

// On Windows: check Windows-native paths first, then Unix paths (for Git Bash / MSYS2 environments
// where tools like claude may be installed in /usr/local/bin or similar).
// On Unix: only check Unix paths.
// Evaluated at call-time (not module load time) so platform can be overridden in tests.
function getCommonBinDirs(): string[] {
  if (process.platform === 'win32') {
    return [...COMMON_BIN_DIRS_WIN32, ...COMMON_BIN_DIRS_UNIX];
  }
  return COMMON_BIN_DIRS_UNIX;
}

// Join a directory and binary name, preserving the path style (posix for Unix dirs, native for Win32)
function joinBinPath(dir: string, name: string): string {
  // Unix-style paths (absolute starting with /) use posix joining to preserve forward slashes
  if (dir.startsWith('/')) return dir + '/' + name;
  return path.join(dir, name);
}

function whichCommand(binaryName: string): string {
  if (process.platform === 'win32') {
    // where.exe is the Windows equivalent of which
    // It returns multiple lines if multiple matches; take the first
    return `where.exe ${binaryName}`;
  }
  return `which ${binaryName}`;
}

function parseWhichOutput(output: string | undefined | null): string {
  if (!output) return '';
  // where.exe returns multiple lines; which returns one. Take the first non-empty line.
  return output.trim().split(/\r?\n/)[0].trim();
}

export function resolveBinary(binaryName: string, cache: { path: string | null }): string {
  if (cache.path) return cache.path;

  const fullPath = getFullPath();

  // On Windows, add .exe and .cmd extension candidates
  const binaryNames = process.platform === 'win32'
    ? [binaryName + '.exe', binaryName + '.cmd', binaryName]
    : [binaryName];

  for (const name of binaryNames) {
    const candidates = getCommonBinDirs().map(dir => joinBinPath(dir, name));
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          cache.path = candidate;
          return candidate;
        }
      } catch {}
    }
  }

  try {
    const cmd = whichCommand(binaryName);
    const resolved = execSync(cmd, {
      env: { ...process.env, PATH: fullPath },
      encoding: 'utf-8',
      timeout: 3000,
    });
    const parsedPath = parseWhichOutput(resolved);
    if (parsedPath) {
      cache.path = parsedPath;
      return parsedPath;
    }
  } catch (err) {
    console.warn(`Failed to resolve ${binaryName} path via which/where:`, err);
  }

  cache.path = binaryName;
  return binaryName;
}

export function validateBinaryExists(
  binaryName: string,
  displayName: string,
  installCommand: string,
): { ok: boolean; message: string } {
  // On Windows, also check .exe and .cmd variants
  const binaryNames = process.platform === 'win32'
    ? [binaryName + '.exe', binaryName + '.cmd', binaryName]
    : [binaryName];

  for (const name of binaryNames) {
    const candidates = getCommonBinDirs().map(dir => joinBinPath(dir, name));
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return { ok: true, message: '' };
      } catch {}
    }
  }

  try {
    const currentPath = process.env.PATH || '';
    const extraDirs = process.platform === 'win32'
      ? COMMON_BIN_DIRS_WIN32
      : [
          ...COMMON_BIN_DIRS_UNIX,
          '/usr/local/sbin',
          '/opt/homebrew/sbin',
        ];

    const separator = process.platform === 'win32' ? ';' : ':';
    const pathSet = new Set(currentPath.split(separator));
    for (const dir of extraDirs) {
      pathSet.add(dir);
    }
    const augmentedPath = Array.from(pathSet).join(separator);

    const cmd = whichCommand(binaryName);
    const resolved = execSync(cmd, {
      env: { ...process.env, PATH: augmentedPath },
      encoding: 'utf-8',
      timeout: 3000,
    });
    if (parseWhichOutput(resolved)) return { ok: true, message: '' };
  } catch {}

  return {
    ok: false,
    message:
      `${displayName} not found.\n\n` +
      `Vibeyard requires the ${displayName} to be installed.\n\n` +
      `Install it with:\n` +
      `  ${installCommand}\n\n` +
      `After installing, restart Vibeyard.`,
  };
}
