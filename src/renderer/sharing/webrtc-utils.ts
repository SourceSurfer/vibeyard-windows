// Shared WebRTC utilities for P2P session sharing.

import type { ShareMessage } from '../../shared/sharing-types.js';
import { encryptPayload, decryptPayload } from './share-crypto.js';

export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function sendMessage(dc: RTCDataChannel, msg: ShareMessage): void {
  if (dc.readyState === 'open') {
    dc.send(JSON.stringify(msg));
  }
}

export async function encodeConnectionCode(desc: RTCSessionDescription | null, passphrase: string): Promise<string> {
  return encryptPayload(JSON.stringify(desc), passphrase);
}

export async function decodeConnectionCode(code: string, expectedType: 'offer' | 'answer' | undefined, passphrase: string): Promise<RTCSessionDescriptionInit> {
  let decoded: string;
  try {
    decoded = await decryptPayload(code, passphrase);
  } catch {
    throw new Error('Invalid connection code: could not decrypt (wrong passphrase?)');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid connection code: malformed data');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed) ||
    !('sdp' in parsed) ||
    typeof (parsed as Record<string, unknown>).type !== 'string' ||
    typeof (parsed as Record<string, unknown>).sdp !== 'string'
  ) {
    throw new Error('Invalid connection code: missing required fields');
  }

  const desc = parsed as RTCSessionDescriptionInit;
  if (desc.type !== 'offer' && desc.type !== 'answer') {
    throw new Error('Invalid connection code: unexpected type');
  }

  if (expectedType && desc.type !== expectedType) {
    throw new Error(`Invalid connection code: expected ${expectedType} but got ${desc.type}`);
  }

  return desc;
}

export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    // Timeout after 10s in case ICE gathering stalls
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, 10_000);
  });
}
