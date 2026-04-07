import { vi } from 'vitest';

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

// Use posix path.join so tests pass on Windows (expandUserPath joins homedir + tilde suffix).
// vi.hoisted is required because vi.mock factories are hoisted above imports.
const { posixJoin } = vi.hoisted(() => {
  const posixPath = require('path').posix;
  return { posixJoin: posixPath.join.bind(posixPath) };
});
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, join: posixJoin };
});

import { expandUserPath } from './fs-utils';

describe('expandUserPath', () => {
  it('expands ~ alone to homedir', () => {
    expect(expandUserPath('~')).toBe('/mock/home');
  });

  it('expands ~/subdir to homedir/subdir', () => {
    expect(expandUserPath('~/git/my-project')).toBe('/mock/home/git/my-project');
  });

  it('expands ~/ (trailing slash only) to homedir with trailing slash', () => {
    expect(expandUserPath('~/')).toBe('/mock/home/');
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandUserPath('/absolute/path/to/project')).toBe('/absolute/path/to/project');
  });

  it('leaves relative paths unchanged', () => {
    expect(expandUserPath('relative/path')).toBe('relative/path');
  });

  it('does not expand ~username paths', () => {
    expect(expandUserPath('~otheruser/projects')).toBe('~otheruser/projects');
  });

  it('does not expand empty string', () => {
    expect(expandUserPath('')).toBe('');
  });
});
