import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

export function validatePrerequisites(): { ok: boolean; message: string } {
  const home = os.homedir();
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.npm-global', 'bin', 'claude'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return { ok: true, message: '' };
    } catch {}
  }

  // Try `which claude` with augmented PATH
  try {
    const currentPath = process.env.PATH || '';
    const extraDirs = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(home, '.local', 'bin'),
      path.join(home, '.npm-global', 'bin'),
      '/usr/local/sbin',
      '/opt/homebrew/sbin',
    ];
    const pathSet = new Set(currentPath.split(':'));
    for (const dir of extraDirs) {
      pathSet.add(dir);
    }
    const augmentedPath = Array.from(pathSet).join(':');

    const resolved = execSync('which claude', {
      env: { ...process.env, PATH: augmentedPath },
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    if (resolved) return { ok: true, message: '' };
  } catch {}

  return {
    ok: false,
    message:
      'Claude CLI not found.\n\n' +
      'Vibeyard requires the Claude Code CLI to be installed.\n\n' +
      'Install it with:\n' +
      '  npm install -g @anthropic-ai/claude-code\n\n' +
      'After installing, restart Vibeyard.',
  };
}
