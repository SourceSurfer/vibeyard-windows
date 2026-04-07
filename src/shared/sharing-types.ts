// P2P session sharing type definitions.

export type ShareMode = 'readonly' | 'readwrite';

// Protocol messages sent over the WebRTC data channel.
export type ShareMessage =
  | { type: 'init'; scrollback: string; mode: ShareMode; cols: number; rows: number; sessionName: string }
  | { type: 'data'; payload: string }
  | { type: 'input'; payload: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'end' }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'auth-challenge'; challenge: string }
  | { type: 'auth-response'; response: string }
  | { type: 'auth-result'; ok: boolean; reason?: string };

// Host-side state for an active share.
export interface ActiveShare {
  sessionId: string;
  mode: ShareMode;
  connected: boolean;
}

// Guest-side state for a remote session.
export interface RemoteSession {
  sessionId: string;
  mode: ShareMode;
  hostSessionName: string;
  connected: boolean;
}
