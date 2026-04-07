import type { InitialContextSnapshot } from '../../shared/types.js';

export type InsightSeverity = 'info' | 'warning';

export interface InsightAction {
  label: string;
  prompt: string;
}

export interface InsightResult {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  metric?: string;
  action?: InsightAction;
}

export interface InsightAnalyzer {
  id: string;
  analyze(snapshot: InitialContextSnapshot): InsightResult[];
}
