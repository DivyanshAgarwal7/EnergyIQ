/**
 * analytics.js — EnergyIQ Analytics Page
 */

document.addEventListener('DOMContentLoaded', () => {
  setDateDefaults();
  populateBuildingFilter();
  loadEfficiency();
  // Set anomaly date to yesterday by default
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  document.getElementById('anomaly-date').value = yesterday.toISOString().split('T')[0];
});

function setDateDefaults() {
  const now = new Date();
  document.getElementById('month-filter').value = now.getMonth() + 1;
  const yearSel = document.getElementById('year-filter');
  for (let opt of yearSel.options) {
    if (parseInt(opt.value) === now.getFullYear()) { yearSel.value = opt.value; break; }
  }
}

async function populateBuildingFilter() {
  try {
    const buildings = await API.buildings();
    const sel = document.getElementById('building-filter');
    buildings.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.building_id;
      opt.textContent = b.building_name;
      sel.appendChild(opt);
    });
  } catch { /* non-fatal */ }
}

// ---- Efficiency Table ----
async function loadEfficiency() {
  const tbody = document.getElementById('efficiency-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Loading...</td></tr>';
  const buildingId = document.getElementById('building-filter').value || null;
  try {
    const rows = await API.efficiency(buildingId);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No data</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const pct = r.efficiency_pct != null ? parseFloat(r.efficiency_pct) : null;
      const barColor = pct == null ? '#4d5a6a'
        : pct > 110 ? '#2dd4a0' : pct >= 90 ? '#4db8ff' : pct >= 70 ? '#f0a500' : pct >= 50 ? '#f05050' : '#c81e1e';
      const barWidth = pct != null ? Math.min(pct, 130) : 0;

      return `
        <tr>
          <td><strong>${r.device_name}</strong></td>
          <td>${r.building_name}</td>
          <td><span class="mono">${r.device_type}</span></td>
          <td class="num">${parseFloat(r.actual_kwh || 0).toFixed(1)}</td>
          <td class="num">${parseFloat(r.expected_kwh || 0).toFixed(1)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="num" style="min-width:44px">${pct != null ? pct + '%' : '—'}</span>
              <div class="efficiency-bar-wrap">
                <div class="efficiency-bar" style="width:${barWidth}%;background:${barColor}"></div>
              </div>
            </div>
          </td>
          <td>${efficiencyBadge(r.efficiency_status)}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

// ---- Building Monthly Report ----
async function loadBuildingReport() {
  const tbody      = document.getElementById('report-tbody');
  const label      = document.getElementById('report-label');
  const buildingId = document.getElementById('building-filter').value;
  const year       = parseInt(document.getElementById('year-filter').value);
  const month      = parseInt(document.getElementById('month-filter').value);

  if (!buildingId) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Please select a building first</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Running report...</td></tr>';
  const d = new Date(year, month - 1, 1);
  label.textContent = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  try {
    const rows = await API.buildingReport(buildingId, year, month);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No data for this period</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${r.device_name}</strong></td>
        <td><span class="mono">${r.device_type}</span></td>
        <td class="num">${r.rated_power_kw}</td>
        <td class="num">${parseFloat(r.actual_kwh || 0).toFixed(1)}</td>
        <td class="num">${parseFloat(r.expected_kwh || 0).toFixed(1)}</td>
        <td class="num">${r.efficiency_pct != null ? r.efficiency_pct + '%' : '—'}</td>
        <td>${efficiencyBadge(r.efficiency_label)}</td>
        <td class="num">${r.days_measured}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

// ---- Anomaly Detection ----
async function runAnomalyDetection() {
  const date   = document.getElementById('anomaly-date').value;
  const result = document.getElementById('anomaly-result');
  const tbody  = document.getElementById('anomaly-tbody');

  if (!date) { alert('Select a date first'); return; }

  tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Running detection...</td></tr>';
  result.style.display = 'none';

  try {
    const res = await API.detectAnomalies(date);
    const count = res.result?.[0]?.anomalies_detected ?? 0;
    result.textContent = `${count} anomal${count === 1 ? 'y' : 'ies'} detected`;
    result.className = 'result-pill';
    result.style.display = 'inline-block';

    // Load the anomaly log for that date from the backend
    await loadAnomalyLog(date);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

async function loadAnomalyLog(date) {
  const tbody = document.getElementById('anomaly-tbody');
  try {
    // Direct query against anomaly_log via a dedicated endpoint
    // For now, show a summary note (Phase 2 will add anomaly log endpoint)
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="loading-row" style="color:var(--green)">
          Detection complete for ${date}. 
          Check anomaly_log table in MySQL Workbench for full records.
        </td>
      </tr>`;
  } catch { /* non-fatal */ }
}

// ---- Helpers ----
function efficiencyBadge(status) {
  // efficiency_pct = expected / actual * 100
  // HIGH score = good (less consumption). LOW score = bad (over consuming).
  const s = (status || '').toUpperCase().replace(/ /g, '_');
  const map = {
    'EFFICIENT':      ['status-normal',      'Efficient'],      // actual < expected (good)
    'NORMAL':         ['status-normal',      'Normal'],         // within range
    'MODERATE':       ['status-moderate',    'Moderate'],       // slightly over
    'INEFFICIENT':    ['status-inefficient', 'Inefficient'],    // significantly over
    'OVER_CONSUMING': ['status-inefficient', 'Over Consuming'], // severely over (bad)
    'OVER CONSUMING': ['status-inefficient', 'Over Consuming'],
    'ACCEPTABLE':     ['status-over',        'Acceptable'],     // legacy label
    'NO_DATA':        ['status-nodata',      'No data'],
    'NO DATA':        ['status-nodata',      'No data'],
  };
  const [cls, label] = map[s] || ['status-nodata', status || '—'];
  return `<span class="status-badge ${cls}">${label}</span>`;
}