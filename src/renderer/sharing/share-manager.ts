// Orchestrates P2P session sharing — ties together peer-host, peer-guest,
// AppState, and the terminal/remote-terminal panes.

import type { ShareMode } from '../../shared/sharing-types.js';
import { startShare, stopShare, broadcastData, broadcastResize, isSharing, type ShareHandle } from './peer-host.js';
import { joinShare, type JoinHandle, type InitData } from './peer-guest.js';
import { appState } from '../state.js';
import {
  createRemoteTerminalPane,
  writeRemoteData,
  showRemoteEndOverlay,
  destroyRemoteTerminal,
} from '../components/remote-terminal-pane.js';

const shareHandles = new Map<string, ShareHandle>();
const guestHandles = new Map<string, JoinHandle>();
const pendingJoinHandles = new Set<JoinHandle>();

// Listeners notified when sharing state changes (start/stop/connect/disconnect)
type ShareChangeListener = () => void;
const shareChangeListeners: ShareChangeListener[] = [];

export function onShareChange(cb: ShareChangeListener): void {
  shareChangeListeners.push(cb);
}

function notifyShareChange(): void {
  for (const cb of shareChangeListeners) cb();
}

// --- Host side ---

export interface ShareResult {
  offer: string;
  handle: ShareHandle;
}

export async function shareSession(sessionId: string, mode: ShareMode, passphrase: string): Promise<ShareResult> {
  const handle = startShare(sessionId, mode, passphrase);
  shareHandles.set(sessionId, handle);
  notifyShareChange();

  const offer = await handle.getOffer();

  handle.onConnected(() => {
    notifyShareChange();
  });

  handle.onDisconnected(() => {
    shareHandles.delete(sessionId);
    notifyShareChange();
  });

  return { offer, handle };
}

export async function acceptShareAnswer(sessionId: string, answer: string): Promise<void> {
  const handle = shareHandles.get(sessionId);
  if (!handle) throw new Error(`No active share for session ${sessionId}`);
  await handle.acceptAnswer(answer);
}

export function endShare(sessionId: string): void {
  stopShare(sessionId);
  shareHandles.delete(sessionId);
  notifyShareChange();
}

export function forwardPtyData(sessionId: string, data: string): void {
  broadcastData(sessionId, data);
}

export function forwardResize(sessionId: string, cols: number, rows: number): void {
  broadcastResize(sessionId, cols, rows);
}

// --- Guest side ---

export async function joinRemoteSession(projectId: string, offer: string, passphrase: string, onConnected?: () => void): Promise<{ answer: string }> {
  const { handle } = joinShare(offer, passphrase);
  const answer = await handle.getAnswer();

  pendingJoinHandles.add(handle);

  // Set up init handler to create the remote session once the connection is established.
  // This happens asynchronously after the host accepts our answer.
  handle.onInit((initData: InitData) => {
    if (!pendingJoinHandles.has(handle)) return;
    pendingJoinHandles.delete(handle);

    const localSessionId = crypto.randomUUID();
    guestHandles.set(localSessionId, handle);

    // Create the terminal pane BEFORE adding to state, because addRemoteSession
    // triggers a layout render that needs the pane to already exist.
    createRemoteTerminalPane(localSessionId, initData.mode, initData.cols, initData.rows, (data: string) => {
      handle.sendInput(data);
    });

    if (initData.scrollback) {
      writeRemoteData(localSessionId, initData.scrollback);
    }

    const session = appState.addRemoteSession(projectId, localSessionId, initData.sessionName, initData.mode);
    if (!session) {
      console.error('Failed to create remote session');
      destroyRemoteTerminal(localSessionId);
      guestHandles.delete(localSessionId);
      handle.disconnect();
      return;
    }

    onConnected?.();

    handle.onData((payload: string) => {
      writeRemoteData(localSessionId, payload);
    });

    const cleanup = () => {
      if (!guestHandles.has(localSessionId)) return;
      showRemoteEndOverlay(localSessionId);
      guestHandles.delete(localSessionId);
    };

    handle.onDisconnected(cleanup);
  });

  handle.onDisconnected(() => {
    pendingJoinHandles.delete(handle);
  });

  return { answer };
}

export function disconnectRemoteSession(sessionId: string): void {
  const handle = guestHandles.get(sessionId);
  if (handle) {
    handle.disconnect();
    guestHandles.delete(sessionId);
  }
}

export function isRemoteSession(sessionId: string): boolean {
  return guestHandles.has(sessionId);
}

// --- Cleanup ---

export function initShareManager(): void {
  appState.on('session-removed', (data?: unknown) => {
    const d = data as { sessionId?: string } | undefined;
    if (!d?.sessionId) return;
    const sessionId = d.sessionId;

    if (isSharing(sessionId)) {
      endShare(sessionId);
    }

    if (guestHandles.has(sessionId)) {
      disconnectRemoteSession(sessionId);
      destroyRemoteTerminal(sessionId);
    }
  });
}

export function cleanupAllShares(): void {
  for (const [sessionId] of shareHandles) {
    endShare(sessionId);
  }
  for (const [sessionId] of guestHandles) {
    disconnectRemoteSession(sessionId);
  }
  for (const handle of pendingJoinHandles) {
    handle.disconnect();
  }
  pendingJoinHandles.clear();
}

export function _resetForTesting(): void {
  shareHandles.clear();
  guestHandles.clear();
  pendingJoinHandles.clear();
  shareChangeListeners.length = 0;
}
