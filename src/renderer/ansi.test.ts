import { stripAnsi } from './ansi';

describe('stripAnsi', () => {
  it('strips CSI color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips multiple CSI sequences', () => {
    expect(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m normal')).toBe('bold green normal');
  });

  it('strips SGR codes with multiple params', () => {
    expect(stripAnsi('\x1b[38;5;196mcolored\x1b[0m')).toBe('colored');
  });

  it('strips OSC sequences terminated by BEL', () => {
    expect(stripAnsi('\x1b]0;window title\x07text')).toBe('text');
  });

  it('strips OSC sequences terminated by ST', () => {
    expect(stripAnsi('\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\')).toBe('link');
  });

  it('returns empty string for empty input', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('preserves plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('handles mixed ANSI and plain text', () => {
    expect(stripAnsi('before \x1b[31mred\x1b[0m after')).toBe('before red after');
  });

  it('strips cursor movement codes', () => {
    expect(stripAnsi('\x1b[2Jhello\x1b[H')).toBe('hello');
  });
});
