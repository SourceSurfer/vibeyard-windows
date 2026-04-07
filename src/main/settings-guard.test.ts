import { vi } from 'vitest';

// Use posix path.join so tests pass on Windows.
const { posixJoin } = vi.hoisted(() => {
  const posixPath = require('path').posix;
  return { posixJoin: posixPath.join.bind(posixPath) };
});
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, join: posixJoin };
});

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

// In-memory store mock so reinstallSettings() can flip preferences and have
// installHooksOnly()/installStatusLine() observe the new value.
const { storeState } = vi.hoisted(() => ({
  storeState: {
    value: {
      version: 1 as const,
      projects: [],
      activeProjectId: null,
      preferences: {
        installClaudeHooks: 'disabled' as 'enabled' | 'disabled',
        statusLineConsent: null as 'granted' | 'declined' | null,
      } as Record<string, unknown>,
    },
  },
}));

vi.mock('./store', () => ({
  loadState: () => storeState.value,
  saveState: (s: typeof storeState.value) => { storeState.value = s; },
  flushState: () => { /* no-op for in-memory mock */ },
}));

// Stub out hook-status so getStatusLineScriptPath returns a deterministic value.
vi.mock('./hook-status', () => ({
  STATUS_DIR: '/tmp/vibeyard',
  getStatusLineScriptPath: () => '/tmp/vibeyard/statusline.sh',
  installStatusLineScript: vi.fn(),
}));

import * as fs from 'fs';
import { reinstallSettings, validateSettings, isVibeyardStatusLine } from './settings-guard';

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  storeState.value = {
    version: 1,
    projects: [],
    activeProjectId: null,
    preferences: {
      installClaudeHooks: 'disabled',
      statusLineConsent: null,
    },
  };
  mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
});

describe('reinstallSettings', () => {
  it('flips installClaudeHooks preference to enabled before installing', () => {
    expect(storeState.value.preferences.installClaudeHooks).toBe('disabled');

    reinstallSettings();

    expect(storeState.value.preferences.installClaudeHooks).toBe('enabled');
    expect(storeState.value.preferences.statusLineConsent).toBe('granted');
  });

  it('writes hooks and statusLine to ~/.claude/settings.json', () => {
    reinstallSettings();

    // First write: hooks via installHooksOnly. Second write: statusLine via installStatusLine.
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);

    const firstWrite = JSON.parse(String(mockWriteFileSync.mock.calls[0][1]));
    expect(firstWrite.hooks).toBeDefined();
    expect(firstWrite.hooks.UserPromptSubmit).toBeDefined();

    const secondWrite = JSON.parse(String(mockWriteFileSync.mock.calls[1][1]));
    expect(secondWrite.statusLine).toBeDefined();
    expect(secondWrite.statusLine.command).toBe('/tmp/vibeyard/statusline.sh');
  });

  it('still installs even if preference was previously enabled', () => {
    storeState.value.preferences.installClaudeHooks = 'enabled';

    reinstallSettings();

    expect(storeState.value.preferences.installClaudeHooks).toBe('enabled');
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
  });
});

describe('validateSettings', () => {
  it('reports vibeyard statusLine when present', () => {
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === '/mock/home/.claude/settings.json') {
        return JSON.stringify({
          statusLine: { type: 'command', command: '/tmp/vibeyard/statusline.sh' },
        });
      }
      throw new Error('ENOENT');
    });

    const result = validateSettings();
    expect(result.statusLine).toBe('vibeyard');
  });

  it('reports foreign statusLine when present', () => {
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === '/mock/home/.claude/settings.json') {
        return JSON.stringify({
          statusLine: { type: 'command', command: '/usr/local/bin/other-tool' },
        });
      }
      throw new Error('ENOENT');
    });

    const result = validateSettings();
    expect(result.statusLine).toBe('foreign');
    expect(result.foreignStatusLineCommand).toBe('/usr/local/bin/other-tool');
  });
});

describe('isVibeyardStatusLine', () => {
  it('returns true for the vibeyard statusLine', () => {
    expect(isVibeyardStatusLine({ command: '/tmp/vibeyard/statusline.sh' })).toBe(true);
  });

  it('returns false for non-vibeyard statusLine', () => {
    expect(isVibeyardStatusLine({ command: '/usr/local/bin/other' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isVibeyardStatusLine(null)).toBe(false);
    expect(isVibeyardStatusLine(undefined)).toBe(false);
  });
});
