import { describe, it, expect, beforeEach, vi } from 'vitest';
import { captureInitialContext, markFreshSession, onAlert, dismissInsight, _resetForTesting } from './session-insights.js';
import { appState, _resetForTesting as resetState } from './state.js';

// Mock the window.vibeyard API
vi.stubGlobal('window', {
  vibeyard: {
    store: { load: vi.fn().mockResolvedValue(null), save: vi.fn() },
  },
});

beforeEach(() => {
  _resetForTesting();
  resetState();
});

function setupProject(): string {
  const project = appState.addProject('Test', '/tmp/test');
  return project.id;
}

function makeContextWindow(usedPercentage: number, totalTokens = 30000, contextWindowSize = 200000) {
  return {
    total_input_tokens: totalTokens,
    total_output_tokens: 0,
    context_window_size: contextWindowSize,
    used_percentage: usedPercentage,
  };
}

describe('session-insights', () => {
  describe('captureInitialContext', () => {
    it('captures initial context for fresh sessions on first costData', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(20));

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights?.initialContextSnapshots).toHaveLength(1);
      expect(project.insights!.initialContextSnapshots[0].usedPercentage).toBe(20);
    });

    it('skips capture on second costData for same session', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(20));
      captureInitialContext(session.id, makeContextWindow(30));

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights?.initialContextSnapshots).toHaveLength(1);
      expect(project.insights!.initialContextSnapshots[0].usedPercentage).toBe(20);
    });

    it('skips capture for resumed sessions (not marked fresh)', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      // Don't call markFreshSession — simulates a resumed session
      captureInitialContext(session.id, makeContextWindow(20));

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights).toBeUndefined();
    });

    it('skips capture when contextWindow is undefined', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, undefined);

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights).toBeUndefined();
    });

    it('skips capture when session has no project', () => {
      // Session ID that doesn't belong to any project
      markFreshSession('orphan-session');
      captureInitialContext('orphan-session', makeContextWindow(20));
      // Should not throw; no project to store on
    });

    it('caps snapshots at 50', () => {
      const projectId = setupProject();

      for (let i = 0; i < 55; i++) {
        const session = appState.addSession(projectId, `Session ${i}`)!;
        markFreshSession(session.id);
        captureInitialContext(session.id, makeContextWindow(20));
      }

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights?.initialContextSnapshots).toHaveLength(50);
    });

    it('captures multiple fresh sessions independently', () => {
      const projectId = setupProject();
      const s1 = appState.addSession(projectId, 'Session 1')!;
      const s2 = appState.addSession(projectId, 'Session 2')!;

      markFreshSession(s1.id);
      markFreshSession(s2.id);
      captureInitialContext(s1.id, makeContextWindow(20));
      captureInitialContext(s2.id, makeContextWindow(10));

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights?.initialContextSnapshots).toHaveLength(2);
      expect(project.insights!.initialContextSnapshots[0].usedPercentage).toBe(20);
      expect(project.insights!.initialContextSnapshots[1].usedPercentage).toBe(10);
    });

    it('stores snapshot with correct sessionId and timestamp', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(5));

      const project = appState.projects.find(p => p.id === projectId)!;
      const snapshot = project.insights!.initialContextSnapshots[0];
      expect(snapshot.sessionId).toBe(session.id);
      expect(snapshot.timestamp).toBeTruthy();
      // Timestamp should be a valid ISO string
      expect(new Date(snapshot.timestamp).toISOString()).toBe(snapshot.timestamp);
    });
  });

  describe('token computation', () => {
    it('computes totalTokens from current_usage when available', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        context_window_size: 200_000,
        used_percentage: 50,
        current_usage: {
          input_tokens: 10_000,
          cache_creation_input_tokens: 5_000,
          cache_read_input_tokens: 85_000,
        },
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].totalTokens).toBe(100_000);
    });

    it('falls back to top-level totals when current_usage is absent', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        total_input_tokens: 80_000,
        total_output_tokens: 20_000,
        context_window_size: 200_000,
        used_percentage: 50,
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].totalTokens).toBe(100_000);
    });

    it('falls back to context_window_tokens when context_window_size is absent', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        total_input_tokens: 10_000,
        total_output_tokens: 0,
        context_window_tokens: 100_000,
        used_percentage: 10,
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].contextWindowSize).toBe(100_000);
    });

    it('uses default 200k context window when neither size field is present', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        total_input_tokens: 10_000,
        total_output_tokens: 0,
        used_percentage: 5,
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].contextWindowSize).toBe(200_000);
    });

    it('computes usedPercentage when used_percentage is absent', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        total_input_tokens: 50_000,
        total_output_tokens: 0,
        context_window_size: 200_000,
        // no used_percentage
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].usedPercentage).toBe(25);
    });

    it('handles zero context window size without division by zero', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        total_input_tokens: 100,
        total_output_tokens: 0,
        context_window_size: 0,
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].usedPercentage).toBe(0);
    });

    it('handles empty current_usage fields gracefully', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      captureInitialContext(session.id, {
        context_window_size: 200_000,
        used_percentage: 0,
        current_usage: {},
      });

      const project = appState.projects.find(p => p.id === projectId)!;
      expect(project.insights!.initialContextSnapshots[0].totalTokens).toBe(0);
    });
  });

  describe('alert emission', () => {
    it('emits alert when threshold exceeded', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      const alerts: Array<{ pid: string; results: unknown[] }> = [];
      onAlert((pid, results) => alerts.push({ pid, results }));

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(20));

      expect(alerts).toHaveLength(1);
      expect(alerts[0].pid).toBe(projectId);
    });

    it('does not emit alert when below threshold', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      const alerts: unknown[] = [];
      onAlert((pid, results) => alerts.push({ pid, results }));

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(10));

      expect(alerts).toHaveLength(0);
    });

    it('does not emit alert when insight is dismissed', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      dismissInsight(projectId, 'big-initial-context');

      const alerts: unknown[] = [];
      onAlert((pid, results) => alerts.push({ pid, results }));

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(20));

      expect(alerts).toHaveLength(0);
    });

    it('emits alert with correct InsightResult content', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      let alertResults: unknown[] = [];
      onAlert((_pid, results) => { alertResults = results; });

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(20));

      expect(alertResults).toHaveLength(1);
      const result = alertResults[0] as any;
      expect(result.id).toBe('big-initial-context');
      expect(result.severity).toBe('warning');
      expect(result.description).toContain('20%');
    });

    it('notifies multiple alert listeners', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      let count = 0;
      onAlert(() => { count++; });
      onAlert(() => { count++; });

      markFreshSession(session.id);
      captureInitialContext(session.id, makeContextWindow(20));

      expect(count).toBe(2);
    });

    it('emits alert for each fresh session independently', () => {
      const projectId = setupProject();
      const s1 = appState.addSession(projectId, 'Session 1')!;
      const s2 = appState.addSession(projectId, 'Session 2')!;

      const alerts: unknown[] = [];
      onAlert((pid, results) => alerts.push({ pid, results }));

      markFreshSession(s1.id);
      markFreshSession(s2.id);
      captureInitialContext(s1.id, makeContextWindow(20));
      captureInitialContext(s2.id, makeContextWindow(25));

      expect(alerts).toHaveLength(2);
    });

    it('does not emit alert for second session when first was below threshold', () => {
      const projectId = setupProject();
      const s1 = appState.addSession(projectId, 'Session 1')!;
      const s2 = appState.addSession(projectId, 'Session 2')!;

      const alerts: unknown[] = [];
      onAlert((pid, results) => alerts.push({ pid, results }));

      markFreshSession(s1.id);
      markFreshSession(s2.id);
      captureInitialContext(s1.id, makeContextWindow(5));
      captureInitialContext(s2.id, makeContextWindow(20));

      expect(alerts).toHaveLength(1);
    });
  });

  describe('dismissInsight', () => {
    it('persists dismissal so future sessions do not alert', () => {
      const projectId = setupProject();

      const alerts: unknown[] = [];
      onAlert((pid, results) => alerts.push({ pid, results }));

      // First session triggers alert
      const s1 = appState.addSession(projectId, 'Session 1')!;
      markFreshSession(s1.id);
      captureInitialContext(s1.id, makeContextWindow(20));
      expect(alerts).toHaveLength(1);

      // Dismiss the insight
      dismissInsight(projectId, 'big-initial-context');

      // Second session should not trigger alert
      const s2 = appState.addSession(projectId, 'Session 2')!;
      markFreshSession(s2.id);
      captureInitialContext(s2.id, makeContextWindow(25));
      expect(alerts).toHaveLength(1); // still 1, not 2
    });
  });

  describe('_resetForTesting', () => {
    it('clears all module state so tests are isolated', () => {
      const projectId = setupProject();
      const session = appState.addSession(projectId, 'Session 1')!;

      markFreshSession(session.id);
      const alerts: unknown[] = [];
      onAlert(() => alerts.push(1));

      _resetForTesting();

      // After reset, session should not be considered fresh
      captureInitialContext(session.id, makeContextWindow(20));
      expect(alerts).toHaveLength(0);
    });
  });
});
