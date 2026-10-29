/**
 * alerts.js — EnergyIQ Alerts Page
 */

let currentTab = 'open';

document.addEventListener('DOMContentLoaded', () => {
  loadAlerts('open');
});

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-open').classList.toggle('active',     tab === 'open');
  document.getElementById('tab-resolved').classList.toggle('active', tab === 'resolved');
  loadAlerts(tab);
}

async function loadAlerts(tab) {
  const container = document.getElementById('alerts-container');
  const resolved  = tab === 'resolved';
  container.innerHTML = '<div class="loading-row">Loading...</div>';

  try {
    const alerts = await API.alerts(resolved);

    // Update count
    const countEl = document.getElementById('open-count');
    if (countEl && !resolved) countEl.textContent = `${alerts.length} open alert${alerts.length !== 1 ? 's' : ''}`;

    if (!alerts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${resolved ? '✓' : '◎'}</div>
          <div>${resolved ? 'No resolved alerts yet' : 'No open alerts — system looks clean'}</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="alerts-list">${alerts.map(a => alertCard(a, resolved)).join('')}</div>`;
  } catch (e) {
    container.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`;
  }
}

function alertCard(a, resolved) {
  const typeClass = a.alert_type === 'SPIKE' ? 'spike'
    : a.alert_type === 'OVER_CONSUMPTION'    ? 'over' : 'weekend';
  const tagClass  = a.alert_type === 'SPIKE' ? 'tag-spike'
    : a.alert_type === 'OVER_CONSUMPTION'    ? 'tag-over' : 'tag-other';

  const resolveBtn = resolved
    ? `<span style="font-size:0.75rem;color:var(--text-muted);font-family:'DM Mono',monospace">Resolved</span>`
    : `<button class="btn-sm" onclick="resolveAlert(${a.alert_id}, this)">Resolve</button>`;

  return `
    <div class="alert-item ${typeClass}" id="alert-${a.alert_id}">
      <span class="alert-type-tag ${tagClass}">${a.alert_type.replace(/_/g,' ')}</span>
      <div class="alert-body">
        <div class="alert-device">${a.device_name} — ${a.building_name}
          <span style="color:var(--text-muted);font-size:0.78rem;margin-left:8px">${a.device_type}</span>
        </div>
        <div class="alert-message">${a.message || '—'}</div>
        <div class="alert-meta">
          Created: ${formatDT(a.created_at)}
          ${resolved && a.resolved_at ? ' · Resolved: ' + formatDT(a.resolved_at) : ''}
        </div>
      </div>
      ${resolveBtn}
    </div>`;
}

async function resolveAlert(alertId, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await API.resolveAlert(alertId);
    const card = document.getElementById(`alert-${alertId}`);
    if (card) {
      card.style.transition = 'opacity 0.4s';
      card.style.opacity = '0.3';
      setTimeout(() => card.remove(), 450);
    }
    // Update count
    const countEl = document.getElementById('open-count');
    if (countEl) {
      const current = parseInt(countEl.textContent) || 0;
      const newCount = Math.max(0, current - 1);
      countEl.textContent = `${newCount} open alert${newCount !== 1 ? 's' : ''}`;
    }
  } catch (e) {
    btn.textContent = 'Error';
    btn.disabled = false;
  }
}

function formatDT(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}