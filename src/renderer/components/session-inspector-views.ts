import { getEvents, getToolStats, getContextHistory, getCostDeltas } from '../session-inspector-state.js';
import { getProviderCapabilities } from '../provider-availability.js';
import { inspectorState } from './session-inspector-state-ui.js';
import {
  emptyMessage,
  formatTokenCount,
  badgeLabel,
  escapeHtml,
  renderUnsupportedGuard,
  getInspectedProviderId,
} from './session-inspector-utils.js';

// --- Costs View ---

export function renderCosts(container: HTMLElement): void {
  if (renderUnsupportedGuard(container, 'costTracking', 'Cost tracking')) return;

  const events = getEvents(inspectorState.inspectedSessionId!);
  const costDeltas = getCostDeltas(inspectorState.inspectedSessionId!);

  if (events.length === 0) {
    container.innerHTML = `<div class="inspector-empty">${emptyMessage('No events yet')}</div>`;
    return;
  }

  // Summary bar — scan backwards without copying the array
  let totalCost = 0;
  let totalTokens = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (totalCost === 0 && events[i].cost_snapshot) {
      totalCost = events[i].cost_snapshot!.total_cost_usd;
    }
    if (totalTokens === 0 && events[i].context_snapshot) {
      totalTokens = events[i].context_snapshot!.total_tokens;
    }
    if (totalCost !== 0 && totalTokens !== 0) break;
  }
  const stepsWithCost = costDeltas.filter(d => d.delta > 0).length;

  const summary = document.createElement('div');
  summary.className = 'inspector-summary';
  summary.innerHTML = `
    <div class="inspector-summary-item"><span class="inspector-summary-label">Total Cost</span><span class="inspector-summary-value">$${totalCost.toFixed(4)}</span></div>
    <div class="inspector-summary-item"><span class="inspector-summary-label">Total Tokens</span><span class="inspector-summary-value">${formatTokenCount(totalTokens)}</span></div>
    <div class="inspector-summary-item"><span class="inspector-summary-label">Avg Cost/Step</span><span class="inspector-summary-value">$${stepsWithCost > 0 ? (totalCost / stepsWithCost).toFixed(4) : '0.0000'}</span></div>
  `;
  container.appendChild(summary);

  // Cost table
  const table = document.createElement('table');
  table.className = 'inspector-table';
  table.innerHTML = '<thead><tr><th>#</th><th>Event</th><th>Tool</th><th>Cost Delta</th><th>Cumulative</th></tr></thead>';
  const tbody = document.createElement('tbody');

  const deltaMap = new Map(costDeltas.map(d => [d.index, d.delta]));

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.cost_snapshot && !deltaMap.has(i)) continue;

    // For synthetic status_update events, attribute the cost to the most recent
    // real event (e.g. the tool call that actually incurred the cost)
    let displayType = ev.type;
    let displayTool = ev.tool_name;
    if (ev.type === 'status_update') {
      for (let j = i - 1; j >= 0; j--) {
        if (events[j].type !== 'status_update') {
          displayType = events[j].type;
          displayTool = events[j].tool_name;
          break;
        }
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${badgeLabel(displayType)}</td>
      <td>${displayTool ? escapeHtml(displayTool) : '-'}</td>
      <td>${deltaMap.has(i) ? `+$${deltaMap.get(i)!.toFixed(4)}` : '-'}</td>
      <td>${ev.cost_snapshot ? `$${ev.cost_snapshot.total_cost_usd.toFixed(4)}` : '-'}</td>
    `;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}

// --- Tools View ---

export function renderTools(container: HTMLElement): void {
  const stats = getToolStats(inspectorState.inspectedSessionId!);

  if (stats.length === 0) {
    container.innerHTML = `<div class="inspector-empty">${emptyMessage('No tool calls yet')}</div>`;
    return;
  }

  const caps = getProviderCapabilities(getInspectedProviderId());
  const showCost = caps?.costTracking !== false;

  const table = document.createElement('table');
  table.className = 'inspector-table';
  table.innerHTML = `<thead><tr><th>Tool</th><th>Calls</th><th>Failures</th><th>Rate</th>${showCost ? '<th>Cost</th>' : ''}</tr></thead>`;
  const tbody = document.createElement('tbody');

  for (const s of stats) {
    const tr = document.createElement('tr');
    const rate = s.calls > 0 ? ((s.failures / s.calls) * 100).toFixed(0) : '0';
    tr.innerHTML = `
      <td>${escapeHtml(s.tool_name)}</td>
      <td>${s.calls}</td>
      <td>${s.failures}</td>
      <td>${rate}%</td>
      ${showCost ? `<td>$${s.totalCost.toFixed(4)}</td>` : ''}
    `;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);

  // Bar chart for top 10 tools
  const maxCalls = stats[0]?.calls ?? 1;
  const chart = document.createElement('div');
  chart.className = 'inspector-bar-chart';

  for (const s of stats.slice(0, 10)) {
    const bar = document.createElement('div');
    bar.className = 'inspector-bar-row';
    const pct = (s.calls / maxCalls) * 100;
    bar.innerHTML = `
      <span class="inspector-bar-label">${escapeHtml(s.tool_name)}</span>
      <div class="inspector-bar-track">
        <div class="inspector-bar-fill" style="width: ${pct}%"></div>
      </div>
      <span class="inspector-bar-count">${s.calls}</span>
    `;
    chart.appendChild(bar);
  }

  container.appendChild(chart);
}

// --- Context View ---

export function renderContext(container: HTMLElement): void {
  if (renderUnsupportedGuard(container, 'contextWindow', 'Context window tracking')) return;

  const history = getContextHistory(inspectorState.inspectedSessionId!);

  if (history.length === 0) {
    container.innerHTML = `<div class="inspector-empty">${emptyMessage('No context data yet')}</div>`;
    return;
  }

  const latest = history[history.length - 1];

  // Current gauge
  const gauge = document.createElement('div');
  gauge.className = 'inspector-context-gauge';
  const pct = latest.usedPercentage;
  const color = pct >= 90 ? 'var(--accent)' : pct >= 70 ? '#f4b400' : '#34a853';
  gauge.innerHTML = `
    <div class="inspector-gauge-label">Context Window Usage</div>
    <div class="inspector-gauge-bar">
      <div class="inspector-gauge-fill" style="width: ${pct}%; background: ${color}"></div>
    </div>
    <div class="inspector-gauge-text">${pct.toFixed(1)}% &middot; ${formatTokenCount(latest.totalTokens)} tokens</div>
  `;
  container.appendChild(gauge);

  // History SVG chart
  if (history.length >= 2) {
    const svgWidth = 320;
    const svgHeight = 160;
    const padding = { top: 10, right: 10, bottom: 25, left: 35 };
    const chartW = svgWidth - padding.left - padding.right;
    const chartH = svgHeight - padding.top - padding.bottom;

    const minTime = history[0].timestamp;
    const maxTime = history[history.length - 1].timestamp;
    const timeRange = maxTime - minTime || 1;

    const points = history.map(p => {
      const x = padding.left + ((p.timestamp - minTime) / timeRange) * chartW;
      const y = padding.top + chartH - (p.usedPercentage / 100) * chartH;
      return { x, y };
    });

    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPoints = `${padding.left},${padding.top + chartH} ` + polylinePoints + ` ${points[points.length - 1].x},${padding.top + chartH}`;

    // Time labels
    const durationMin = (maxTime - minTime) / 60000;
    const midLabel = (durationMin / 2).toFixed(0) + 'm';
    const endLabel = durationMin.toFixed(0) + 'm';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute('class', 'inspector-context-chart');
    svg.innerHTML = `
      <!-- Warning bands -->
      <rect x="${padding.left}" y="${padding.top}" width="${chartW}" height="${chartH * 0.05}" fill="rgba(233,69,96,0.1)" />
      <rect x="${padding.left}" y="${padding.top + chartH * 0.05}" width="${chartW}" height="${chartH * 0.15}" fill="rgba(244,180,0,0.08)" />
      <!-- Threshold lines -->
      <line x1="${padding.left}" y1="${padding.top + chartH * 0.05}" x2="${padding.left + chartW}" y2="${padding.top + chartH * 0.05}" stroke="var(--accent)" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5" />
      <line x1="${padding.left}" y1="${padding.top + chartH * 0.2}" x2="${padding.left + chartW}" y2="${padding.top + chartH * 0.2}" stroke="#f4b400" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5" />
      <!-- Area fill -->
      <polygon points="${areaPoints}" fill="rgba(66,133,244,0.15)" />
      <!-- Line -->
      <polyline points="${polylinePoints}" fill="none" stroke="#4285f4" stroke-width="1.5" />
      <!-- Y-axis labels -->
      <text x="${padding.left - 4}" y="${padding.top + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">100%</text>
      <text x="${padding.left - 4}" y="${padding.top + chartH * 0.2 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">80%</text>
      <text x="${padding.left - 4}" y="${padding.top + chartH * 0.5 + 3}" fill="var(--text-muted)" font-size="9" text-anchor="end">50%</text>
      <text x="${padding.left - 4}" y="${padding.top + chartH}" fill="var(--text-muted)" font-size="9" text-anchor="end">0%</text>
      <!-- X-axis labels -->
      <text x="${padding.left}" y="${svgHeight - 4}" fill="var(--text-muted)" font-size="9" text-anchor="start">0m</text>
      <text x="${padding.left + chartW / 2}" y="${svgHeight - 4}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${midLabel}</text>
      <text x="${padding.left + chartW}" y="${svgHeight - 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">${endLabel}</text>
    `;
    container.appendChild(svg);
  }
}
