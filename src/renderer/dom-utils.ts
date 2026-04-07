/** Escape a string for safe insertion into innerHTML. */
export function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

const AREA_LABELS: Record<string, string> = { staged: 'Staged', working: 'Changes', untracked: 'Untracked', conflicted: 'Conflicted' };

/** Return a user-friendly label for a git area value. */
export function areaLabel(area: string): string {
  return AREA_LABELS[area] || area;
}

/** Return a CSS color for a 0-100 readiness score. */
export function scoreColor(score: number): string {
  if (score >= 70) return '#34a853';
  if (score >= 40) return '#f4b400';
  return '#e94560';
}

/** Create a numeric PIN input field (4–8 digits). */
export function createPinInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.className = 'share-pin-input';
  input.placeholder = 'PIN';
  input.maxLength = 8;
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
  });
  return input;
}
