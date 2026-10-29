/**
 * reports.js — EnergyIQ Reports Page (Phase 3)
 */

document.addEventListener('DOMContentLoaded', () => {
  populateBuildingFilter();
  loadSchedules();
  loadHistory();
});

async function populateBuildingFilter() {
  try {
    const buildings = await API.buildings();
    const sel = document.getElementById('new-building');
    buildings.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.building_id;
      opt.textContent = b.building_name;
      sel.appendChild(opt);
    });
  } catch {}
}

// ---- Schedule Cards ----
async function loadSchedules() {
  const grid = document.getElementById('schedule-grid');
  try {
    const rows = await API.schedules();
    document.getElementById('schedule-count').textContent =
      `${rows.length} schedule${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      grid.innerHTML = '<div class="loading-row">No schedules yet — create one above</div>';
      return;
    }
    grid.innerHTML = rows.map(r => scheduleCard(r)).join('');
  } catch (e) {
    grid.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`;
  }
}

function scheduleCard(r) {
  const freqCls = (r.frequency || '').toLowerCase();
  const active  = r.is_active;
  const lastSt  = r.last_run_status;
  const dotCls  = lastSt === 'SUCCESS' ? 'dot-success'
                : lastSt === 'FAILED'  ? 'dot-failed' : 'dot-none';
  const nextRun = r.next_run_at ? fmtDT(r.next_run_at) : 'Not scheduled';
  const lastRun = r.last_run_at ? fmtDT(r.last_run_at) : 'Never run';
  const bld     = r.building_name ? ` · ${r.building_name}` : '';

  return `
    <div class="schedule-card ${active ? '' : 'inactive'}" id="scard-${r.schedule_id}">
      <div class="sc-header">
        <div>
          <div class="sc-name">${r.report_name}</div>
          <div class="sc-type">${r.report_type.replace(/_/g,' ')}${bld}</div>
        </div>
        <div class="sc-badges">
          <span class="sc-badge ${freqCls}">${r.frequency}</span>
          <span class="sc-badge">${r.export_format}</span>
        </div>
      </div>
      <div class="sc-meta">
        <span>
          <span class="run-dot ${dotCls}"></span>
          Last run: ${lastRun}
          ${r.last_rows_exported != null ? ` · ${r.last_rows_exported} rows` : ''}
        </span>
        <span>Next: ${nextRun}</span>
        <span style="color:var(--text-muted)">Total runs: ${r.total_runs || 0}</span>
      </div>
      <div class="sc-actions">
        <button class="sc-run-btn" onclick="runReport(${r.schedule_id}, this)">
          ↓ Run Now
        </button>
        <button class="sc-toggle-btn" onclick="toggleSchedule(${r.schedule_id})">
          ${active ? 'Disable' : 'Enable'}
        </button>
        <button class="sc-delete-btn" onclick="deleteSchedule(${r.schedule_id})" title="Delete">✕</button>
      </div>
    </div>`;
}

// ---- Run Report (POST → download CSV as Blob) ----
async function runReport(scheduleId, btn) {
  const originalText = btn.textContent;
  btn.textContent    = 'Running...';
  btn.disabled       = true;

  try {
    const res = await fetch(`http://localhost:5000/api/reports/run/${scheduleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    // Get filename from Content-Disposition header if available
    const disposition = res.headers.get('Content-Disposition') || '';
    const match       = disposition.match(/filename="?([^"]+)"?/);
    const filename    = match ? match[1] : `report_${scheduleId}.csv`;

    // Convert response to blob and trigger download
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = '✓ Downloaded';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled    = false;
    }, 2000);

    // Refresh cards and history to show updated run info
    setTimeout(() => { loadSchedules(); loadHistory(); }, 500);

  } catch (e) {
    btn.textContent = 'Error';
    btn.disabled    = false;
    setTimeout(() => { btn.textContent = originalText; }, 2000);
    console.error('Run report error:', e.message);
    alert(`Failed to run report: ${e.message}`);
  }
}

async function toggleSchedule(scheduleId) {
  try {
    await API.toggleSchedule(scheduleId);
    loadSchedules();
  } catch (e) { alert(`Error: ${e.message}`); }
}

async function deleteSchedule(scheduleId) {
  if (!confirm('Delete this schedule? Run history will also be removed.')) return;
  try {
    await API.deleteSchedule(scheduleId);
    const card = document.getElementById(`scard-${scheduleId}`);
    if (card) { card.style.opacity = '0'; setTimeout(() => card.remove(), 300); }
    loadSchedules();
    loadHistory();
  } catch (e) { alert(`Error: ${e.message}`); }
}

// ---- Create Schedule ----
async function createSchedule() {
  const data = {
    report_name:   document.getElementById('new-name').value.trim(),
    report_type:   document.getElementById('new-type').value,
    frequency:     document.getElementById('new-freq').value,
    building_id:   document.getElementById('new-building').value || null,
    export_format: document.getElementById('new-format').value
  };

  if (!data.report_name) {
    showFormResult('Report name is required', 'error');
    return;
  }

  try {
    await API.createSchedule(data);
    showFormResult(`✓ Schedule "${data.report_name}" created`, 'success');
    document.getElementById('new-name').value = '';
    loadSchedules();
  } catch (e) {
    showFormResult(`Error: ${e.message}`, 'error');
  }
}

function showFormResult(msg, type) {
  const el = document.getElementById('new-schedule-result');
  el.textContent   = msg;
  el.className     = `form-result ${type}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ---- Run History ----
async function loadHistory() {
  const tbody = document.getElementById('history-tbody');
  try {
    const rows = await API.reportHistory();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No runs yet</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const statusCls = r.status === 'SUCCESS' ? 'status-normal' : 'status-inefficient';
      return `
        <tr>
          <td><strong>${r.report_name}</strong></td>
          <td><span class="mono" style="font-size:0.75rem">${(r.report_type||'').replace(/_/g,' ')}</span></td>
          <td class="mono" style="font-size:0.78rem">${fmtDT(r.run_at)}</td>
          <td><span class="status-badge ${statusCls}">${r.status}</span></td>
          <td class="num">${r.rows_exported ?? '—'}</td>
          <td>
            <button class="link-sm" style="background:none;border:none;cursor:pointer;color:var(--accent)"
              onclick="runReport(${r.schedule_id}, this)">↓ Re-run</button>
          </td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

// ---- Helpers ----
function fmtDT(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-IN', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}