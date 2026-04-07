import type { InitialContextSnapshot } from '../shared/types.js';
import type { InsightResult } from './insights/types.js';
import { analyzeInitialContext } from './insights/registry.js';
import { appState } from './state.js';

type AlertCallback = (projectId: string, results: InsightResult[]) => void;

const capturedSessions = new Set<string>();
const freshSessions = new Set<string>();
const alertListeners: AlertCallback[] = [];
let cleanupListenerAttached = false;

/** Mark a session as fresh (not resumed) — call before spawnTerminal sets isResume=true */
export function markFreshSession(sessionId: string): void {
  freshSessions.add(sessionId);
}

/** Capture initial context on first costData for fresh sessions */
export function captureInitialContext(
  sessionId: string,
  contextWindow: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_size?: number;
    context_window_tokens?: number;
    used_percentage?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  } | undefined
): void {
  if (!contextWindow) return;
  if (capturedSessions.has(sessionId)) return;
  if (!freshSessions.has(sessionId)) return;
  if (!appState.preferences.insightsEnabled) return;

  capturedSessions.add(sessionId);

  const usage = contextWindow.current_usage;
  const totalTokens = usage
    ? (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
    : (contextWindow.total_input_tokens ?? 0) + (contextWindow.total_output_tokens ?? 0);

  const DEFAULT_CONTEXT_WINDOW = 200_000;
  const contextWindowSize = contextWindow.context_window_size ?? contextWindow.context_window_tokens ?? DEFAULT_CONTEXT_WINDOW;
  const usedPercentage = contextWindow.used_percentage ?? (contextWindowSize > 0 ? (totalTokens / contextWindowSize) * 100 : 0);

  const snapshot: InitialContextSnapshot = {
    sessionId,
    timestamp: new Date().toISOString(),
    totalTokens,
    contextWindowSize,
    usedPercentage,
  };

  // Find project for this session
  const project = appState.projects.find(p => p.sessions.some(s => s.id === sessionId));
  if (!project) return;

  appState.addInsightSnapshot(project.id, snapshot);

  const results = analyzeInitialContext(snapshot);
  if (results.length === 0) return;

  // Filter out dismissed insights
  const undismissed = results.filter(r => !appState.isInsightDismissed(project.id, r.id));
  if (undismissed.length === 0) return;

  for (const cb of alertListeners) cb(project.id, undismissed);
}

/** Subscribe to insight alerts */
export function onAlert(callback: AlertCallback): void {
  alertListeners.push(callback);
  // Attach session cleanup listener once
  if (!cleanupListenerAttached) {
    cleanupListenerAttached = true;
    appState.on('session-removed', (data?: unknown) => {
      const d = data as { sessionId?: string } | undefined;
      if (d?.sessionId) {
        capturedSessions.delete(d.sessionId);
        freshSessions.delete(d.sessionId);
      }
    });
  }
}

/** Dismiss an insight for a project (persisted) */
export function dismissInsight(projectId: string, insightId: string): void {
  appState.dismissInsight(projectId, insightId);
}

/** @internal Test-only: reset all module state */
export function _resetForTesting(): void {
  capturedSessions.clear();
  freshSessions.clear();
  alertListeners.length = 0;
  cleanupListenerAttached = false;
}
