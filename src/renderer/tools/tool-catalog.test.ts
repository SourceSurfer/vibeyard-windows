import { describe, it, expect } from 'vitest';
import { findTool } from './tool-catalog.js';

describe('tool-catalog', () => {
  it('finds gh tool', () => {
    const tool = findTool('gh');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('GitHub CLI');
    expect(tool!.description).toBe('efficient GitHub access instead of web fetching');
  });

  it('finds jq tool', () => {
    const tool = findTool('jq');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('jq');
  });

  it('returns undefined for unknown tool', () => {
    expect(findTool('unknown-tool-xyz')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(findTool('')).toBeUndefined();
  });
});
