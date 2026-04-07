import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAppState = vi.hoisted(() => ({
  starPromptDismissed: false,
  appLaunchCount: 0,
  dismissStarPrompt: vi.fn(),
}));

vi.mock('./modal.js', () => ({ closeModal: vi.fn() }));
vi.mock('../state.js', () => ({ appState: mockAppState }));

// Stub minimal DOM elements that the dialog needs
function stubDOM(): void {
  const elements: Record<string, any> = {};
  const makeEl = (id: string) => {
    const el: any = {
      id,
      textContent: '',
      innerHTML: '',
      style: {},
      classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => true) },
      appendChild: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
    };
    elements[id] = el;
    return el;
  };
  makeEl('modal-overlay');
  makeEl('modal');
  makeEl('modal-title');
  makeEl('modal-body');
  makeEl('modal-cancel');
  makeEl('modal-confirm');

  vi.stubGlobal('document', {
    getElementById: (id: string) => elements[id] || null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    createElement: vi.fn(() => makeEl('dynamic')),
  });
  vi.stubGlobal('window', {
    vibeyard: { app: { openExternal: vi.fn() } },
  });
}

import { checkStarPrompt } from './star-prompt-dialog';

beforeEach(() => {
  mockAppState.starPromptDismissed = false;
  mockAppState.appLaunchCount = 0;
  mockAppState.dismissStarPrompt.mockClear();
  stubDOM();
});

describe('checkStarPrompt', () => {
  it('does not show dialog when launch count is below threshold', () => {
    mockAppState.appLaunchCount = 5;
    checkStarPrompt();
    const overlay = document.getElementById('modal-overlay')!;
    expect(overlay.classList.remove).not.toHaveBeenCalled();
  });

  it('does not show dialog when already dismissed', () => {
    mockAppState.appLaunchCount = 15;
    mockAppState.starPromptDismissed = true;
    checkStarPrompt();
    const overlay = document.getElementById('modal-overlay')!;
    expect(overlay.classList.remove).not.toHaveBeenCalled();
  });

  it('shows dialog when launch count meets threshold and not dismissed', () => {
    mockAppState.appLaunchCount = 10;
    checkStarPrompt();
    const overlay = document.getElementById('modal-overlay')! as any;
    expect(overlay.classList.remove).toHaveBeenCalledWith('hidden');
  });

  it('shows dialog when launch count exceeds threshold', () => {
    mockAppState.appLaunchCount = 25;
    checkStarPrompt();
    const overlay = document.getElementById('modal-overlay')! as any;
    expect(overlay.classList.remove).toHaveBeenCalledWith('hidden');
  });
});
