import * as path from 'path';
import { homedir } from 'os';
import { ipcMain, BrowserWindow } from 'electron';
import { getStatusLineScriptPath } from './hook-status';
import { HOOK_MARKER, installHooksOnly, installStatusLine } from './claude-cli';
import { readJsonSafe } from './fs-utils';
import { loadState, saveState, flushState } from './store';
import type { SettingsValidationResult } from '../shared/types';

const EXPECTED_HOOK_EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PostToolUse',
  'PostToolUseFailure', 'Stop', 'StopFailure', 'PermissionRequest',
];

function readClaudeSettings(): Record<string, unknown> {
  return readJsonSafe(path.join(homedir(), '.claude', 'settings.json')) ?? {};
}

export function isVibeyardStatusLine(statusLine: unknown): boolean {
  if (!statusLine || typeof statusLine !== 'object') return false;
  const sl = statusLine as Record<string, unknown>;
  return sl.command === getStatusLineScriptPath();
}

export function validateSettings(): SettingsValidationResult {
  const settings = readClaudeSettings();

  let statusLine: SettingsValidationResult['statusLine'] = 'missing';
  let foreignStatusLineCommand: string | undefined;
  if (settings.statusLine) {
    if (isVibeyardStatusLine(settings.statusLine)) {
      statusLine = 'vibeyard';
    } else {
      statusLine = 'foreign';
      const sl = settings.statusLine as Record<string, unknown>;
      foreignStatusLineCommand = String(sl.command ?? sl.url ?? JSON.stringify(settings.statusLine));
    }
  }

  let hooks: SettingsValidationResult['hooks'] = 'missing';
  const hookDetails: Record<string, boolean> = Object.fromEntries(EXPECTED_HOOK_EVENTS.map(e => [e, false]));
  const existingHooks = settings.hooks as Record<string, Array<{ hooks?: Array<{ command?: string }> }>> | undefined;
  if (existingHooks) {
    let found = 0;
    for (const event of EXPECTED_HOOK_EVENTS) {
      const matchers = existingHooks[event];
      const installed = matchers?.some(m => m.hooks?.some(h => h.command?.includes(HOOK_MARKER))) ?? false;
      hookDetails[event] = installed;
      if (installed) found++;
    }
    if (found === EXPECTED_HOOK_EVENTS.length) {
      hooks = 'complete';
    } else if (found > 0) {
      hooks = 'partial';
    }
  }

  return { statusLine, hooks, foreignStatusLineCommand, hookDetails };
}

/**
 * Guarded hook/statusLine installation. Shows a dialog if a foreign statusLine
 * is detected and the user hasn't previously granted/declined consent.
 */
export async function guardedInstall(win: BrowserWindow | null): Promise<void> {
  const validation = validateSettings();

  // Always install hooks (additive, non-destructive)
  installHooksOnly();

  if (validation.statusLine === 'vibeyard' || validation.statusLine === 'missing') {
    installStatusLine();
    return;
  }

  // Foreign statusLine detected — check stored consent
  const state = loadState();
  const consent = state.preferences.statusLineConsent;

  if (consent === 'granted') {
    installStatusLine();
    return;
  }

  if (consent === 'declined') {
    return;
  }

  // No prior decision — ask the user via in-app modal
  if (!win) return;

  // Wait for renderer to be ready before sending IPC
  if (win.webContents.isLoading()) {
    await new Promise<void>(resolve => win.webContents.once('did-finish-load', resolve));
  }

  const foreignCmd = validation.foreignStatusLineCommand ?? '(unknown)';
  const channel = 'settings:conflictDialogResponse';
  const choice = await new Promise<'replace' | 'keep'>((resolve) => {
    const onResponse = (_event: Electron.IpcMainEvent, c: string) => {
      win.removeListener('closed', onClose);
      resolve(c === 'replace' ? 'replace' : 'keep');
    };
    const onClose = () => {
      ipcMain.removeListener(channel, onResponse);
      resolve('keep');
    };
    ipcMain.once(channel, onResponse);
    win.once('closed', onClose);
    win.webContents.send('settings:showConflictDialog', { foreignCommand: foreignCmd });
  });

  state.preferences.statusLineConsent = choice === 'replace' ? 'granted' : 'declined';
  saveState(state);

  if (choice === 'replace') {
    installStatusLine();
  }
}

/**
 * Force reinstall both hooks and statusLine (for "Fix Settings" CTA).
 * Resets consent to granted since this is an explicit user action.
 *
 * Also flips `installClaudeHooks` preference to 'enabled' before installing,
 * so the gate inside installHooksOnly()/installStatusLine() does not turn this
 * call into a no-op + cleanup. Without this, "Force reinstall" would silently
 * delete hooks instead of installing them.
 */
export function reinstallSettings(): void {
  const state = loadState();
  state.preferences.installClaudeHooks = 'enabled';
  state.preferences.statusLineConsent = 'granted';
  saveState(state);
  // installHooksOnly()/installStatusLine() re-read state from disk via loadState(),
  // so flush the debounced save synchronously before calling them — otherwise the
  // gate inside them would still see the old preference value and the call would
  // become a no-op + cleanup instead of an install.
  flushState();

  installHooksOnly();
  installStatusLine();
}
