import type { InitialContextSnapshot } from '../../shared/types.js';
import type { InsightAnalyzer, InsightResult } from './types.js';

const THRESHOLD_PERCENTAGE = 15;

export const bigInitialContext: InsightAnalyzer = {
  id: 'big-initial-context',
  analyze(snapshot: InitialContextSnapshot): InsightResult[] {
    if (snapshot.usedPercentage >= THRESHOLD_PERCENTAGE) {
      const pct = Math.round(snapshot.usedPercentage);
      const tokens = snapshot.totalTokens.toLocaleString();
      return [{
        id: 'big-initial-context',
        severity: 'warning',
        title: 'Large pre-context detected',
        description: `Pre-context uses ${pct}% of context window (${tokens} tokens). This may impact response quality and cost efficiency.`,
        metric: `${pct}%`,
        action: {
          label: 'Fix in New Session',
          prompt: `My pre-context is using ${pct}% of the context window (${tokens} tokens out of ${snapshot.contextWindowSize.toLocaleString()}). This is too high and impacts response quality and cost. Please analyze what's contributing to the pre-context size and help me reduce it. Check CLAUDE.md files, custom instructions, MCP server configurations, and any other sources of pre-loaded context. Suggest specific changes to bring the pre-context below 15% of the context window.`,
        },
      }];
    }
    return [];
  },
};
