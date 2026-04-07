import { appState } from '../state.js';
import { showReadinessModal } from './readiness-modal.js';
import { esc, scoreColor } from '../dom-utils.js';
import type { ReadinessResult } from '../../shared/types.js';

const container = document.getElementById('readiness-section')!;
let collapsed = true;
let scanning = false;
let lastExcludedKey = '';

export function initReadinessSection(): void {
  appState.on('state-loaded', () => {
    render();
    autoScanIfNeeded();
  });
  appState.on('project-changed', () => {
    render();
    autoScanIfNeeded();
  });
  appState.on('readiness-changed', render);
  appState.on('preferences-changed', () => {
    applyVisibility();
    const newKey = (appState.preferences.readinessExcludedProviders ?? []).join(',');
    if (newKey !== lastExcludedKey) {
      lastExcludedKey = newKey;
      autoScanIfNeeded();
    }
  });
  render();
}

function applyVisibility(): void {
  const visible = appState.preferences.sidebarViews?.readinessSection ?? true;
  container.classList.toggle('hidden', !visible);
}

function autoScanIfNeeded(): void {
  const project = appState.activeProject;
  if (!project) return;
  if (scanning) return;
  // Rescan silently if we already have results to avoid UI flicker
  runScan(!!project.readiness);
}

async function runScan(silent = false): Promise<void> {
  const project = appState.activeProject;
  if (!project || scanning) return;

  scanning = true;
  // Only show scanning UI when there's no existing result (or explicitly requested)
  if (!silent) render();

  try {
    const excluded = appState.preferences.readinessExcludedProviders ?? [];
    const result = await window.vibeyard.readiness.analyze(project.path, excluded.length > 0 ? excluded : undefined);
    appState.setProjectReadiness(project.id, result);
  } catch (err) {
    console.warn('Readiness scan failed:', err);
  } finally {
    scanning = false;
    render();
  }
}


function render(): void {
  applyVisibility();
  const project = appState.activeProject;

  if (!project) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const result = project.readiness;

  const section = document.createElement('div');
  section.className = 'config-section';

  const header = document.createElement('div');
  header.className = 'config-section-header';

  const toggleSpan = `<span class="config-section-toggle ${collapsed ? 'collapsed' : ''}">&#x25BC;</span>`;
  const scoreBadge = result
    ? `<span class="readiness-badge" style="background:${scoreColor(result.overallScore)}">${result.overallScore}%</span>`
    : '';
  header.innerHTML = `${toggleSpan} AI Readiness ${scoreBadge}`;

  // Scan/Rescan button
  const scanBtn = document.createElement('button');
  scanBtn.className = 'readiness-scan-btn';
  scanBtn.textContent = scanning ? 'Scanning...' : (result ? 'Rescan' : 'Scan');
  scanBtn.disabled = scanning;
  scanBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    runScan();
  });
  header.appendChild(scanBtn);

  const body = document.createElement('div');
  body.className = `config-section-body${collapsed ? ' hidden' : ''}`;

  if (scanning && !result) {
    const loading = document.createElement('div');
    loading.className = 'readiness-loading';
    loading.textContent = 'Analyzing project...';
    body.appendChild(loading);
  } else if (result) {
    for (const category of result.categories) {
      const row = document.createElement('div');
      row.className = 'readiness-category-row config-item-clickable';

      const color = scoreColor(category.score);
      row.innerHTML = `
        <span class="readiness-category-name">${esc(category.name)}</span>
        <div class="readiness-progress-bar">
          <div class="readiness-progress-fill" style="width:${category.score}%;background:${color}"></div>
        </div>
        <span class="readiness-category-score" style="color:${color}">${category.score}%</span>
      `;

      row.addEventListener('click', () => {
        showReadinessModal(result);
      });

      body.appendChild(row);
    }
  }

  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.readiness-scan-btn')) return;
    collapsed = !collapsed;
    const toggle = header.querySelector('.config-section-toggle')!;
    toggle.classList.toggle('collapsed');
    body.classList.toggle('hidden');
  });

  section.appendChild(header);
  section.appendChild(body);
  container.appendChild(section);
}

