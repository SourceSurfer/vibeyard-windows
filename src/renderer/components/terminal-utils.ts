import type { Terminal } from '@xterm/xterm';

type ExtraKeyHandler = (e: KeyboardEvent) => boolean | undefined;

/**
 * Detects whether the renderer is running on macOS.
 * On macOS, Ctrl+C is always SIGINT and Cmd+C handles clipboard copy.
 * On Windows/Linux, Ctrl+C with a selection should copy to clipboard
 * (Windows Terminal / VS Code / ConEmu convention) and only fall through
 * to SIGINT when there is no selection.
 */
function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const uaDataPlatform = nav.userAgentData?.platform;
  if (uaDataPlatform) return uaDataPlatform.toLowerCase().includes('mac');
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
}

const IS_MAC = isMacPlatform();

/**
 * Attaches shared key event handling to a terminal:
 * - Cmd/Ctrl+F: bubbles up to document (prevents xterm from consuming it)
 * - Ctrl+Shift+C: copies selected text to clipboard (always)
 * - Ctrl+C on Windows/Linux: copies if there's a selection, otherwise
 *   falls through to xterm so the PTY receives SIGINT as usual
 *
 * Pass an optional `extend` handler for terminal-specific key behavior.
 * Return false to suppress the key, undefined to fall through to default.
 */
export function attachClipboardCopyHandler(terminal: Terminal, extend?: ExtraKeyHandler): void {
  terminal.attachCustomKeyEventHandler((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') return false;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
      if (e.type === 'keydown') {
        const selection = terminal.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
      }
      return false;
    }
    // Windows/Linux convention: Ctrl+C copies the current selection if there is
    // one; otherwise it falls through and the PTY receives ^C / SIGINT. macOS is
    // unaffected because Cmd+C handles clipboard there and Ctrl+C is always SIGINT.
    if (!IS_MAC && e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
      if (e.type === 'keydown') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          terminal.clearSelection();
          return false;
        }
      } else if (e.type === 'keyup') {
        // Suppress the keyup that pairs with a copy keydown so xterm doesn't
        // see a stray release event after we consumed the press.
        return false;
      }
      // No selection — let xterm send ^C to the PTY.
    }
    return extend?.(e) ?? true;
  });
}
