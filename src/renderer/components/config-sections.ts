import { appState } from '../state.js';
import { showMcpAddModal } from './mcp-add-modal.js';
import { getTerminalInstance, getLastUserInputTime } from './terminal-pane.js';
import type { ProviderConfig, ProviderId, McpServer, Agent, Skill, Command, Hook } from '../types.js';

const collapsed: Record<string, boolean> = {};

function scopeBadge(scope: 'user' | 'project'): string {
  return `<span class="scope-badge ${scope}">${scope}</span>`;
}

function renderSection(id: string, title: string, items: HTMLElement[], count: number, onAdd?: () => void): HTMLElement {
  const section = document.createElement('div');
  section.className = 'config-section';

  const isCollapsed = collapsed[id] ?? true;

  const header = document.createElement('div');
  header.className = 'config-section-header';
  header.innerHTML = `<span class="config-section-toggle ${isCollapsed ? 'collapsed' : ''}">&#x25BC;</span>${title}<span class="config-section-count">${count}</span>`;

  if (onAdd) {
    const addBtn = document.createElement('button');
    addBtn.className = 'config-section-add-btn';
    addBtn.textContent = '+';
    addBtn.title = `Add ${title.replace(/s$/, '')}`;
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
    header.appendChild(addBtn);
  }

  const body = document.createElement('div');
  body.className = `config-section-body${isCollapsed ? ' hidden' : ''}`;

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'config-empty';
    empty.textContent = 'None configured';
    body.appendChild(empty);
  } else {
    items.forEach(el => body.appendChild(el));
  }

  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.config-section-add-btn')) return;
    collapsed[id] = !collapsed[id];
    const toggle = header.querySelector('.config-section-toggle')!;
    toggle.classList.toggle('collapsed');
    body.classList.toggle('hidden');
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

function openConfigFile(filePath: string): void {
  const project = appState.activeProject;
  if (project && filePath) {
    appState.addFileReaderSession(project.id, filePath);
  }
}

// === Smart click-to-insert state machine ====================================
//
// When the user clicks an item in the sidebar, we don't always want to do a
// raw insert. Two specific behaviours from the user request:
//   1. Same agent clicked twice in a row → silently ignore the second click.
//   2. Different agents clicked in a row → build a multi-agent prompt
//      ("Use the A and B subagents to ", "Use the A, B, and C subagents to ").
//
// To do this we keep a per-session "current chain" with: the list of items
// already in the chain, the byte length of the text we last wrote, and the
// timestamp of that write. On a subsequent click we check three conditions
// before treating it as a chain extension instead of a fresh write:
//
//   - The chain belongs to the currently active session.
//   - It was written less than CLICK_CHAIN_WINDOW_MS ago.
//   - The user has NOT typed anything in this session since our last write
//     (terminal-pane records keystroke timestamps in lastUserInputTimes).
//
// If all three hold, we send `\x7f` (DEL — what the Backspace key actually
// transmits in xterm) the exact number of times needed to erase our previous
// write, then write the new chain text. If any condition fails, we treat the
// click as a fresh insertion and start a new chain.
//
// We never read what's currently in Claude Code's input field — PTY is a
// one-way channel from our side — so the dirty-input check is the only safe
// guard against erasing user-typed text. It is conservative on purpose:
// even one stray keystroke between clicks resets the chain.

const CLICK_CHAIN_WINDOW_MS = 8000;

interface ClickChain {
  kind: 'agent' | 'command';
  sessionId: string;
  items: string[];          // names already in the chain (in click order)
  insertedLength: number;   // length of the text we last wrote (for erase)
  lastWriteTime: number;
}

const clickChains = new Map<string, ClickChain>(); // keyed by sessionId

function buildAgentChainText(names: string[]): string {
  if (names.length === 1) {
    return `Use the ${names[0]} subagent to `;
  }
  if (names.length === 2) {
    return `Use the ${names[0]} and ${names[1]} subagents to `;
  }
  // 3+: Oxford-comma list
  const allButLast = names.slice(0, -1).join(', ');
  const last = names[names.length - 1];
  return `Use the ${allButLast}, and ${last} subagents to `;
}

/**
 * Resolve the active session for click-to-insert. Returns null if there is no
 * eligible Claude CLI session in the foreground (special pane, non-Claude
 * provider, or no terminal instance yet).
 */
function getActiveClaudeSession(): { sessionId: string; instance: ReturnType<typeof getTerminalInstance> } | null {
  const session = appState.activeSession;
  if (!session || session.type) return null;
  if ((session.providerId || 'claude') !== 'claude') return null;
  const instance = getTerminalInstance(session.id);
  if (!instance) return null;
  return { sessionId: session.id, instance };
}

/**
 * Returns true if the existing chain in `clickChains` is still valid for the
 * given session and kind (no expiry, no user typing since last write).
 */
function isChainStillValid(chain: ClickChain | undefined, sessionId: string, kind: 'agent' | 'command'): chain is ClickChain {
  if (!chain) return false;
  if (chain.sessionId !== sessionId) return false;
  if (chain.kind !== kind) return false;
  const now = Date.now();
  if (now - chain.lastWriteTime > CLICK_CHAIN_WINDOW_MS) return false;
  // If the user typed anything in this session AFTER our last write, the
  // chain is invalidated — we must not erase user-typed text.
  if (getLastUserInputTime(sessionId) > chain.lastWriteTime) return false;
  return true;
}

function eraseChars(sessionId: string, count: number): void {
  if (count <= 0) return;
  // \x7f (DEL) is what the Backspace key sends in xterm by default and is
  // what Claude Code's TUI input library treats as "delete previous char".
  window.vibeyard.pty.write(sessionId, '\x7f'.repeat(count));
}

/**
 * Try to insert (or chain) an agent reference into the active Claude session.
 * Returns true on success, false if there is no eligible session — caller
 * should fall back to opening the agent file in the read-only viewer.
 */
function tryInsertAgent(agent: Agent): boolean {
  const active = getActiveClaudeSession();
  if (!active) return false;
  const { sessionId, instance } = active;
  if (!instance) return false;

  const existing = clickChains.get(sessionId);
  if (isChainStillValid(existing, sessionId, 'agent')) {
    // Same agent clicked twice → silently ignore (dedupe).
    if (existing.items.includes(agent.name)) {
      instance.terminal.focus();
      return true;
    }
    // Different agent → extend the chain. Erase the previous text and write
    // the new "Use the A, B and C subagents to " variant in its place.
    const newItems = [...existing.items, agent.name];
    const newText = buildAgentChainText(newItems);
    try {
      eraseChars(sessionId, existing.insertedLength);
      window.vibeyard.pty.write(sessionId, newText);
      clickChains.set(sessionId, {
        kind: 'agent',
        sessionId,
        items: newItems,
        insertedLength: newText.length,
        lastWriteTime: Date.now(),
      });
      instance.terminal.focus();
      return true;
    } catch {
      return false;
    }
  }

  // Fresh insertion: no chain, expired chain, wrong kind, or user typed.
  const text = buildAgentChainText([agent.name]);
  try {
    window.vibeyard.pty.write(sessionId, text);
    clickChains.set(sessionId, {
      kind: 'agent',
      sessionId,
      items: [agent.name],
      insertedLength: text.length,
      lastWriteTime: Date.now(),
    });
    instance.terminal.focus();
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to insert a slash-command reference into the active Claude session.
 * Slash commands do not chain (each is a complete prompt template), so the
 * only special behaviour here is dedupe: clicking the same command twice in
 * a row silently ignores the second click. Different commands fall through
 * to a normal append (the user can manually clean up if they changed their
 * mind — slash commands are short).
 */
function tryInsertCommand(cmd: Command): boolean {
  const active = getActiveClaudeSession();
  if (!active) return false;
  const { sessionId, instance } = active;
  if (!instance) return false;

  const existing = clickChains.get(sessionId);
  if (isChainStillValid(existing, sessionId, 'command')) {
    // Same command clicked twice → silently ignore (dedupe).
    if (existing.items.includes(cmd.name)) {
      instance.terminal.focus();
      return true;
    }
    // Different command in the window — fall through to fresh insertion below.
  }

  const text = `/${cmd.name} `;
  try {
    window.vibeyard.pty.write(sessionId, text);
    clickChains.set(sessionId, {
      kind: 'command',
      sessionId,
      items: [cmd.name],
      insertedLength: text.length,
      lastWriteTime: Date.now(),
    });
    instance.terminal.focus();
    return true;
  } catch {
    return false;
  }
}

function mcpItem(server: McpServer): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(server.name)}</span><span class="config-item-detail">${esc(server.status)}</span>${scopeBadge(server.scope)}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'config-item-remove-btn';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = 'Remove server';
  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Remove MCP server "${server.name}"?`)) return;
    const projectPath = appState.activeProject?.path;
    await window.vibeyard.mcp.removeServer(server.name, server.filePath, server.scope, projectPath);
    refresh();
  });
  el.appendChild(removeBtn);

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.config-item-remove-btn')) return;
    openConfigFile(server.filePath);
  });
  return el;
}

function agentItem(agent: Agent): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(agent.name)}</span><span class="config-item-detail">${esc(agent.model)}</span>${scopeBadge(agent.scope)}`;
  el.title = 'Click to invoke subagent in active Claude session\nClick another agent within 8s to chain them ("A and B subagents")\nCtrl+Click to view file';
  el.addEventListener('click', (e) => {
    // Ctrl/Cmd+click → view file in read-only viewer (legacy behavior)
    if (e.ctrlKey || e.metaKey) {
      openConfigFile(agent.filePath);
      return;
    }
    // Default: insert or chain. Same agent twice in a row → silent dedupe.
    // Different agent within 8s of last click → builds "Use the A and B
    // subagents to " (or "A, B, and C" for 3+). Fresh insertion otherwise.
    const inserted = tryInsertAgent(agent);
    if (!inserted) openConfigFile(agent.filePath);
  });
  return el;
}

function skillItem(skill: Skill): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(skill.name)}</span><span class="config-item-detail">${esc(skill.description)}</span>${scopeBadge(skill.scope)}`;
  el.addEventListener('click', () => openConfigFile(skill.filePath));
  return el;
}

function commandItem(cmd: Command): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">/${esc(cmd.name)}</span><span class="config-item-detail">${esc(cmd.description)}</span>${scopeBadge(cmd.scope)}`;
  el.title = 'Click to insert into active Claude session\nCtrl+Click to view file';
  el.addEventListener('click', (e) => {
    // Ctrl/Cmd+click → view file in read-only viewer (legacy behavior)
    if (e.ctrlKey || e.metaKey) {
      openConfigFile(cmd.filePath);
      return;
    }
    // Default: insert "/cmd-name " into the active Claude session, with
    // dedupe protection (clicking the same command twice in a row is a no-op).
    // If no eligible session is active, fall back to opening the file.
    const inserted = tryInsertCommand(cmd);
    if (!inserted) openConfigFile(cmd.filePath);
  });
  return el;
}

function hookItem(hook: Hook): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(hook.name)}</span><span class="config-item-detail">${esc(hook.description)}</span>${scopeBadge(hook.scope)}`;
  el.addEventListener('click', () => openConfigFile(hook.filePath));
  return el;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function applyVisibility(): void {
  const container = document.getElementById('config-sections');
  if (!container) return;
  const visible = appState.preferences.sidebarViews?.configSections ?? true;
  container.classList.toggle('hidden', !visible);
}

export function getConfigProviderId(): ProviderId {
  const project = appState.activeProject;
  if (!project) return 'claude';

  const activeSession = appState.activeSession;
  if (activeSession && !activeSession.type) {
    return (activeSession.providerId || 'claude') as ProviderId;
  }

  const recentCliSession = [...project.sessions].reverse().find(session => !session.type);
  return (recentCliSession?.providerId || 'claude') as ProviderId;
}

async function refresh(): Promise<void> {
  const container = document.getElementById('config-sections');
  if (!container) return;

  applyVisibility();

  const project = appState.activeProject;
  if (!project) {
    container.innerHTML = '';
    return;
  }

  // Only show loading indicator on first render (when container is empty)
  const isFirstLoad = container.children.length === 0;
  if (isFirstLoad) {
    container.innerHTML = '<div class="config-loading">Loading...</div>';
  }

  const providerId = getConfigProviderId();
  let config: ProviderConfig;
  try {
    config = await window.vibeyard.provider.getConfig(providerId, project.path);
  } catch {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  container.appendChild(renderSection(
    'mcp',
    'MCP Servers',
    config.mcpServers.map(mcpItem),
    config.mcpServers.length,
    providerId === 'claude' ? () => showMcpAddModal(() => refresh()) : undefined,
  ));

  container.appendChild(renderSection(
    'agents',
    'Agents',
    config.agents.map(agentItem),
    config.agents.length,
  ));

  container.appendChild(renderSection(
    'skills',
    'Skills',
    config.skills.map(skillItem),
    config.skills.length,
  ));

  if (providerId !== 'codex') {
    container.appendChild(renderSection(
      'commands',
      'Commands',
      config.commands.map(commandItem),
      config.commands.length,
    ));
  }

  if (providerId === 'claude') {
    container.appendChild(renderSection(
      'hooks',
      'Hooks',
      config.hooks.map(hookItem),
      config.hooks.length,
    ));
  }
}

function watchActiveProject(): void {
  const project = appState.activeProject;
  if (project) {
    window.vibeyard.provider.watchProject(getConfigProviderId(), project.path);
  }
}

export function initConfigSections(): void {
  appState.on('project-changed', () => { watchActiveProject(); refresh(); });
  appState.on('state-loaded', () => { watchActiveProject(); refresh(); });
  appState.on('session-changed', () => { watchActiveProject(); refresh(); });
  appState.on('preferences-changed', () => applyVisibility());
  window.vibeyard.provider.onConfigChanged(() => refresh());
}
