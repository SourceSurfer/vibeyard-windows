import { stripAnsi } from '../ansi';
import { appState } from '../state.js';
import { fitAllVisible } from './terminal-pane.js';

interface DebugEvent {
  timestamp: number;
  type: string;
  sessionId: string;
  data?: unknown;
}

const MAX_EVENTS = 500;
const NO_MATCH = '__no_match__';
const events: DebugEvent[] = [];
let visible = false;
let panel: HTMLElement | null = null;
let logEl: HTMLElement | null = null;
let autoScroll = true;
let filterType = '';
let filterSessionId = '';
let countInterval: ReturnType<typeof setInterval> | null = null;
let countBar: HTMLElement | null = null;

const TYPE_COLORS: Record<string, string> = {
  'hookStatus': '#f4b400',
  'costData': '#34a853',
  'cliSessionId': '#4285f4',

  'ptyExit': '#e94560',
  'stateEvent': '#bb86fc',
};

export function logDebugEvent(type: string, sessionId: string, data?: unknown): void {
  events.push({ timestamp: Date.now(), type, sessionId, data });
  if (events.length > MAX_EVENTS) events.shift();
  if (visible && logEl) appendEventRow(events[events.length - 1]);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function shortSessionId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) + '..' : id;
}

function getSessionName(sessionId: string): string {
  for (const project of appState.projects) {
    const session = project.sessions.find(s => s.id === sessionId);
    if (session) return session.name;
  }
  return shortSessionId(sessionId);
}

function resolveSessionFilter(query: string): string {
  if (!query) return '';
  for (const project of appState.projects) {
    if (project.sessions.some(s => s.id === query)) return query;
  }
  // Events may reference sessions no longer in appState
  if (events.some(e => e.sessionId === query)) return query;
  const lowerQuery = query.toLowerCase();
  for (const project of appState.projects) {
    for (const session of project.sessions) {
      if (session.name.toLowerCase().includes(lowerQuery)) return session.id;
    }
  }
  const prefixMatch = events.find(e => e.sessionId.startsWith(query));
  if (prefixMatch) return prefixMatch.sessionId;
  return NO_MATCH;
}

function getFilteredEvents(): DebugEvent[] {
  return events.filter(e => {
    if (filterType && e.type !== filterType) return false;
    if (filterSessionId && e.sessionId !== filterSessionId) return false;
    return true;
  });
}

function formatData(data: unknown): string {
  if (data === undefined) return '';
  if (typeof data === 'string') return stripAnsi(data);
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function renderEventRow(ev: DebugEvent): void {
  if (!logEl) return;

  const row = document.createElement('div');
  row.className = 'debug-event-row';

  const color = TYPE_COLORS[ev.type] || '#a0a0b0';

  const time = document.createElement('span');
  time.className = 'debug-time';
  time.textContent = formatTime(ev.timestamp);
  row.appendChild(time);

  const type = document.createElement('span');
  type.className = 'debug-type';
  type.style.color = color;
  type.textContent = ev.type;
  row.appendChild(type);

  const sid = document.createElement('span');
  sid.className = 'debug-session';
  sid.textContent = shortSessionId(ev.sessionId);
  sid.title = ev.sessionId;
  row.appendChild(sid);

  if (ev.data !== undefined) {
    const dataStr = formatData(ev.data);
    const truncated = dataStr.length > 120 ? dataStr.slice(0, 120) + '...' : dataStr;
    const dataEl = document.createElement('span');
    dataEl.className = 'debug-data';
    dataEl.textContent = truncated;
    if (dataStr.length > 120) dataEl.title = dataStr.slice(0, 1000);
    row.appendChild(dataEl);
  }

  logEl.appendChild(row);

  if (autoScroll) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function appendEventRow(ev: DebugEvent): void {
  if (filterType && ev.type !== filterType) return;
  if (filterSessionId && ev.sessionId !== filterSessionId) return;
  renderEventRow(ev);
}

function renderAllEvents(): void {
  if (!logEl) return;
  logEl.innerHTML = '';
  for (const ev of getFilteredEvents()) {
    renderEventRow(ev);
  }
}

function createPanel(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'debug-panel';
  el.className = 'hidden';

  // Header
  const header = document.createElement('div');
  header.className = 'debug-header';

  const title = document.createElement('span');
  title.className = 'debug-title';
  title.textContent = 'Event Debug';
  header.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'debug-controls';

  // Filter dropdown
  const select = document.createElement('select');
  select.className = 'debug-filter';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All Events';
  select.appendChild(allOpt);
  for (const t of Object.keys(TYPE_COLORS)) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    filterType = select.value;
    renderAllEvents();
  });
  controls.appendChild(select);

  // Session filter input
  const sessionFilterWrap = document.createElement('div');
  sessionFilterWrap.className = 'debug-session-filter-wrap';

  const sessionInput = document.createElement('input');
  sessionInput.type = 'text';
  sessionInput.className = 'debug-filter debug-session-input';
  sessionInput.placeholder = 'Filter by session ID';
  sessionInput.addEventListener('input', () => {
    filterSessionId = resolveSessionFilter(sessionInput.value.trim());
    renderAllEvents();
  });
  sessionFilterWrap.appendChild(sessionInput);

  const clearInputBtn = document.createElement('button');
  clearInputBtn.className = 'debug-btn debug-session-clear';
  clearInputBtn.innerHTML = '&times;';
  clearInputBtn.title = 'Clear session filter';
  clearInputBtn.addEventListener('click', () => {
    sessionInput.value = '';
    filterSessionId = '';
    renderAllEvents();
  });
  sessionFilterWrap.appendChild(clearInputBtn);
  controls.appendChild(sessionFilterWrap);

  // Auto-scroll toggle
  const scrollBtn = document.createElement('button');
  scrollBtn.className = 'debug-btn';
  scrollBtn.textContent = 'Auto-scroll: ON';
  scrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll;
    scrollBtn.textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
  });
  controls.appendChild(scrollBtn);

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.className = 'debug-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    events.length = 0;
    if (logEl) logEl.innerHTML = '';
  });
  controls.appendChild(clearBtn);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'debug-btn debug-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => toggleDebugPanel());
  controls.appendChild(closeBtn);

  header.appendChild(controls);
  el.appendChild(header);

  // Event count
  countBar = document.createElement('div');
  countBar.className = 'debug-count-bar';
  el.appendChild(countBar);

  // Log area
  const log = document.createElement('div');
  log.className = 'debug-log';
  el.appendChild(log);

  document.body.appendChild(el);
  logEl = log;

  return el;
}

export function setDebugVisible(show: boolean): void {
  if (!panel) panel = createPanel();

  visible = show;
  if (visible) {
    panel.classList.remove('hidden');
    document.body.classList.add('debug-panel-open');
    renderAllEvents();
    if (!countInterval && countBar) {
      const updateCount = () => {
        const filtered = getFilteredEvents();
        const filters: string[] = [];
        if (filterType) filters.push(filterType);
        if (filterSessionId && filterSessionId !== NO_MATCH) filters.push(getSessionName(filterSessionId));
        countBar!.textContent = `${filtered.length} events${filters.length ? ` (filtered: ${filters.join(', ')})` : ''}`;
      };
      updateCount();
      countInterval = setInterval(updateCount, 500);
    }
  } else {
    panel.classList.add('hidden');
    document.body.classList.remove('debug-panel-open');
    if (countInterval) {
      clearInterval(countInterval);
      countInterval = null;
    }
  }
  requestAnimationFrame(fitAllVisible);
}

export function toggleDebugPanel(): void {
  setDebugVisible(!visible);
}

export function initDebugPanel(): void {
  // Ctrl+Shift+D toggles debug panel
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      toggleDebugPanel();
    }
  });
}
