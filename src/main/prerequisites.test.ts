import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as child_process from 'child_process';

vi.mock('fs');
vi.mock('child_process');

import { validatePrerequisites } from './prerequisites';

describe('validatePrerequisites', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns ok when a candidate path exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p === '/usr/local/bin/claude';
    });

    const result = validatePrerequisites();
    expect(result.ok).toBe(true);
  });

  it('returns ok when which finds claude', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.execSync).mockReturnValue('/some/other/path/claude\n');

    const result = validatePrerequisites();
    expect(result.ok).toBe(true);
  });

  it('returns not ok with message when nothing found', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const result = validatePrerequisites();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Claude CLI not found');
    expect(result.message).toContain('npm install -g @anthropic-ai/claude-code');
  });
});
