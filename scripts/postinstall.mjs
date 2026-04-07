/**
 * Cross-platform postinstall script for Vibeyard.
 * Replaces the Unix-only shell one-liner:
 *   test -f node_modules/electron-builder/package.json && electron-builder install-app-deps || true
 *
 * Runs electron-builder install-app-deps only when electron-builder is installed.
 * Exits cleanly (code 0) if electron-builder is absent — this is expected during
 * Phase 1 dev installs where electron-builder is excluded to work around network issues.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const ebPackageJson = path.join(root, 'node_modules', 'electron-builder', 'package.json');

if (!fs.existsSync(ebPackageJson)) {
  console.log('[postinstall] electron-builder not installed, skipping install-app-deps');
  process.exit(0);
}

console.log('[postinstall] running electron-builder install-app-deps...');

const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules', 'electron-builder', 'cli.js'), 'install-app-deps'],
  { stdio: 'inherit', cwd: root }
);

if (result.error) {
  console.warn('[postinstall] electron-builder install-app-deps failed:', result.error.message);
  // Non-fatal — continue to patch-package step even if install-app-deps fails
} else if ((result.status ?? 0) !== 0) {
  console.warn('[postinstall] electron-builder install-app-deps exited with', result.status, '(non-fatal)');
  // Non-fatal — node-pty has prebuilds for win32-x64; build-from-source failure is acceptable
}

// Apply patch-package patches (e.g. app-builder-lib Windows workarounds).
// Non-fatal: a fresh clone without patches/ directory should not break npm install.
const patchPkgJson = path.join(root, 'node_modules', 'patch-package', 'package.json');
if (!fs.existsSync(patchPkgJson)) {
  console.log('[postinstall] patch-package not installed, skipping patches');
  process.exit(0);
}

console.log('[postinstall] applying patch-package patches...');
const patchResult = spawnSync('npx', ['patch-package'], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
});
if (patchResult.status !== 0) {
  console.error('[postinstall] patch-package failed (non-fatal)');
}
process.exit(0);
