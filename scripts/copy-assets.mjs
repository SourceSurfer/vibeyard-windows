/**
 * Cross-platform asset copy script for Vibeyard build pipeline.
 * Replaces the Unix-only shell commands in package.json copy-assets script.
 * Uses Node.js built-in fs module only — works on Windows, macOS, and Linux.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function copy(src, dest) {
  const srcPath = path.join(root, src);
  const destPath = path.join(root, dest);

  if (!fs.existsSync(srcPath)) {
    console.warn(`[copy-assets] WARNING: source not found, skipping: ${srcPath}`);
    return;
  }

  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true });

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, { recursive: true, force: true });
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
  console.log(`[copy-assets] ${src} -> ${dest}`);
}

function remove(target) {
  const targetPath = path.join(root, target);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    console.log(`[copy-assets] removed: ${target}`);
  }
}

// Ensure dist/renderer exists
fs.mkdirSync(path.join(root, 'dist', 'renderer'), { recursive: true });
fs.mkdirSync(path.join(root, 'dist', 'renderer', 'assets', 'providers'), { recursive: true });

// Copy renderer HTML and CSS
copy('src/renderer/index.html', 'dist/renderer/index.html');
copy('src/renderer/styles.css', 'dist/renderer/styles.css');

// Replace styles directory
remove('dist/renderer/styles');
copy('src/renderer/styles', 'dist/renderer/styles');

// Copy xterm CSS
copy('node_modules/@xterm/xterm/css/xterm.css', 'dist/renderer/xterm.css');

// Copy app icon (may not exist in CI/minimal installs)
copy('build/icon.png', 'dist/renderer/icon.png');

// Copy changelog
copy('CHANGELOG.md', 'dist/renderer/CHANGELOG.md');

// Copy provider assets
copy('src/renderer/assets/providers', 'dist/renderer/assets/providers');

console.log('[copy-assets] done');
