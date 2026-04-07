import type { InitialContextSnapshot } from '../../shared/types.js';
import type { InsightAnalyzer, InsightResult } from './types.js';
import { bigInitialContext } from './big-initial-context.js';

const analyzers: InsightAnalyzer[] = [];

export function registerAnalyzer(analyzer: InsightAnalyzer): void {
  analyzers.push(analyzer);
}

export function analyzeInitialContext(snapshot: InitialContextSnapshot): InsightResult[] {
  const results: InsightResult[] = [];
  for (const analyzer of analyzers) {
    results.push(...analyzer.analyze(snapshot));
  }
  return results;
}

// Register built-in analyzers
registerAnalyzer(bigInitialContext);
