/**
 * Pre-flight script for Windows: ensures electron-builder binary tools (NSIS,
 * NSIS Resources, winCodeSign) are present in the local cache before
 * `electron-builder` runs and tries to download them itself.
 *
 * Why: electron-builder uses `app-builder.exe download-artifact` to fetch and
 * unpack .7z archives from GitHub Releases. That tool requires `7za` in PATH.
 * On developer machines where 7-Zip is installed but not in PATH (or not at all),
 * the build fails. This script:
 *   1. Locates or installs 7za (looks in known locations, instructs user if missing).
 *   2. Downloads all required artifacts once, caching them in
 *      %LOCALAPPDATA%\electron-builder\Cache.
 *   3. Is idempotent: if all artifacts are already cached it exits in < 1s.
 *
 * Only runs on Windows (win32). On other platforms this script is a no-op.
 *
 * Artifacts fetched:
 *   nsis-3.0.4.1           (NSIS compiler)
 *   nsis-resources-3.4.1   (NSIS templates/plugins)
 *   win-codesign@1.1.0     (signtool / rcedit for Windows)
 */

import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── No-op on non-Windows ──────────────────────────────────────────────────────
if (process.platform !== 'win32') {
  process.exit(0);
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const APP_BUILDER_EXE = path.join(
  projectRoot,
  'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe'
);

const CACHE_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local'),
  'electron-builder', 'Cache'
);

// ── Artifacts list ────────────────────────────────────────────────────────────
// Each entry mirrors what app-builder-lib's getBinFromUrl() would request.
// cacheKey  = `${releaseName}-${basename(filename, ext)}`
// cacheDir  = CACHE_DIR/<subdir>/<cacheKey>
// url       = https://github.com/electron-userland/electron-builder-binaries/releases/download/<releaseName>/<filename>
// sha512    = checksum from app-builder-lib sources (for integrity verification)
const BASE_URL = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/';

const ARTIFACTS = [
  {
    releaseName: 'nsis-3.0.4.1',
    filename: 'nsis-3.0.4.1.7z',
    sha512: 'VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q==',
    subdir: 'nsis',
  },
  {
    releaseName: 'nsis-resources-3.4.1',
    filename: 'nsis-resources-3.4.1.7z',
    sha512: 'Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==',
    subdir: 'nsis',
  },
  {
    releaseName: 'win-codesign@1.1.0',
    filename: 'win-codesign-windows-x64.zip',
    sha512: 'lLEOXdJP3dzjRI+/E3Rf8e3RqEh1qs0DRMRgmxHDbuSmXABAwEzhW+tj8g/VMIlxPTD12cyvWIyMbRZq4RxvsA==',
    subdir: 'win',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the cacheKey app-builder uses for a given artifact.
 * Mirrors getBinFromUrl() in app-builder-lib/out/binDownload.js:
 *   cacheKey = `${releaseName}-${path.basename(filename, path.extname(filename))}`
 */
function cacheKey(artifact) {
  const ext = path.extname(artifact.filename);
  const base = path.basename(artifact.filename, ext);
  return `${artifact.releaseName}-${base}`;
}

/**
 * Returns the expected cache directory for an artifact.
 */
function artifactCacheDir(artifact) {
  return path.join(CACHE_DIR, artifact.subdir, cacheKey(artifact));
}

/**
 * Returns true if the artifact is already cached (directory is non-empty).
 */
function isCached(artifact) {
  const dir = artifactCacheDir(artifact);
  try {
    const entries = fs.readdirSync(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Locates `7za` or `7z` in well-known Windows locations.
 * Returns the path or null if not found.
 */
function find7za() {
  // Check PATH first via where.exe
  const whereResult = spawnSync('where.exe', ['7za'], { encoding: 'utf8' });
  if (whereResult.status === 0 && whereResult.stdout.trim()) {
    return whereResult.stdout.trim().split('\n')[0].trim();
  }

  // Fallback: check user bin dir (our own workaround) and standard install dirs
  const candidates = [
    path.join(process.env.USERPROFILE || '', 'bin', '7za.exe'),
    'C:\\Program Files\\7-Zip\\7za.exe',
    'C:\\Program Files (x86)\\7-Zip\\7za.exe',
    'C:\\Program Files\\7-Zip\\7z.exe',   // 7z also handles .7z
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Ensures `7za` is available in PATH-accessible form.
 * If found but not in PATH, adds its directory to process.env.PATH so that
 * app-builder.exe (a child process) can find it.
 */
function ensure7za() {
  const p = find7za();
  if (!p) {
    console.error(`
ERROR: 7-Zip (7za) is required but not found.

electron-builder needs 7za to unpack NSIS and winCodeSign binaries.

Install options:
  - winget: winget install 7zip.7zip
  - Download from https://7-zip.org/

After installation, run this script again or run: npm run dist
`);
    process.exit(1);
  }

  // Add the directory to PATH so child processes (app-builder.exe) can find 7za
  const dir = path.dirname(p);
  if (!process.env.PATH.split(path.delimiter).includes(dir)) {
    process.env.PATH = process.env.PATH + path.delimiter + dir;
  }

  // If the found binary is 7z.exe (not 7za.exe), create a user-local copy named 7za.exe
  if (path.basename(p).toLowerCase() === '7z.exe') {
    const userBin = path.join(process.env.USERPROFILE || '', 'bin');
    const sevenZa = path.join(userBin, '7za.exe');
    if (!fs.existsSync(sevenZa)) {
      try {
        fs.mkdirSync(userBin, { recursive: true });
        fs.copyFileSync(p, sevenZa);
        console.log(`[setup-binaries] Created ${sevenZa} (copy of ${p})`);
      } catch (e) {
        console.warn(`[setup-binaries] Warning: could not create 7za.exe alias: ${e.message}`);
      }
    }
    if (!process.env.PATH.split(path.delimiter).includes(userBin)) {
      process.env.PATH = process.env.PATH + path.delimiter + userBin;
    }
  }

  return p;
}

/**
 * Downloads and unpacks a single artifact via app-builder.exe.
 */
function downloadArtifact(artifact) {
  const key = cacheKey(artifact);
  const url = `${BASE_URL}${artifact.releaseName}/${artifact.filename}`;

  console.log(`[setup-binaries] Downloading ${key}...`);

  const result = spawnSync(
    APP_BUILDER_EXE,
    [
      'download-artifact',
      '--name', key,
      '--url', url,
      '--sha512', artifact.sha512,
    ],
    {
      stdio: 'inherit',
      env: process.env,  // includes updated PATH with 7za directory
    }
  );

  if (result.status !== 0) {
    console.error(`[setup-binaries] Failed to download ${key} (exit code ${result.status})`);
    process.exit(result.status || 1);
  }

  console.log(`[setup-binaries] Done: ${key}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const missing = ARTIFACTS.filter(a => !isCached(a));

  if (missing.length === 0) {
    console.log('[setup-binaries] All electron-builder binaries already cached. Skipping download.');
    process.exit(0);
  }

  console.log(`[setup-binaries] ${missing.length} artifact(s) missing from cache, downloading...`);
  console.log(`[setup-binaries] Cache directory: ${CACHE_DIR}`);

  // Verify app-builder.exe is present
  if (!fs.existsSync(APP_BUILDER_EXE)) {
    console.error(`[setup-binaries] ERROR: app-builder.exe not found at ${APP_BUILDER_EXE}`);
    console.error('[setup-binaries] Run: npm install');
    process.exit(1);
  }

  // Ensure 7za is available before spawning app-builder.exe
  ensure7za();

  for (const artifact of missing) {
    downloadArtifact(artifact);
  }

  console.log('[setup-binaries] All electron-builder binaries ready.');
}

main().catch(e => {
  console.error('[setup-binaries] Fatal error:', e.message);
  process.exit(1);
});
