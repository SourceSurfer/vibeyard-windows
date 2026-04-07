import { describe, it, expect } from 'vitest';
import { analyzeInitialContext, registerAnalyzer } from './registry.js';
import type { InitialContextSnapshot } from '../../shared/types.js';
import type { InsightAnalyzer } from './types.js';

function makeSnapshot(usedPercentage: number): InitialContextSnapshot {
  return {
    sessionId: 'test-session',
    timestamp: new Date().toISOString(),
    totalTokens: 30000,
    contextWindowSize: 200000,
    usedPercentage,
  };
}

describe('insight registry', () => {
  it('returns results from built-in bigInitialContext analyzer', () => {
    const results = analyzeInitialContext(makeSnapshot(20));
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('big-initial-context');
  });

  it('returns empty results when no analyzers trigger', () => {
    const results = analyzeInitialContext(makeSnapshot(5));
    expect(results).toEqual([]);
  });

  it('aggregates results from multiple registered analyzers', () => {
    const customAnalyzer: InsightAnalyzer = {
      id: 'test-analyzer',
      analyze: () => [{
        id: 'test-insight',
        severity: 'info',
        title: 'Test',
        description: 'Test insight',
      }],
    };
    registerAnalyzer(customAnalyzer);

    // With usedPercentage >= 15, bigInitialContext also fires
    const results = analyzeInitialContext(makeSnapshot(20));
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some(r => r.id === 'test-insight')).toBe(true);
    expect(results.some(r => r.id === 'big-initial-context')).toBe(true);
  });
});
