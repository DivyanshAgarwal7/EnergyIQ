/**
 * inefficiency.js — EnergyIQ Inefficiency Detection Page (Phase 2)
 */

let rankingChart = null;
let activeTab    = 'inefficient';

document.addEventListener('DOMContentLoaded', () => {
  // Set export links
  document.getElementById('export-ineff-btn').href = API.exportUrl('inefficient-devices');
  document.getElementById('export-deg-btn').href   = API.exportUrl('degradation');

  populateBuildingFilter();
  loadSummaryKpis();
  loadInefficientDevices();
  loadWeekendData();    // preload
  loadDegradation();    // preload
});

// ---- Tab switching ----
function showTab(tab) {
  activeTab = tab;
  ['inefficient','degradation','weekend','ranking'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display   = t === tab ? 'block' : 'none';
    document.getElementById(`stab-${t === 'inefficient' ? 'ineff' : t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'ranking' && !rankingChart) loadRanking('asc');
}

// ---- Summary KPIs ----
async function loadSummaryKpis() {
  try {
    const d = await API.inefficiencySummary();
    document.getElementById('kpi-ineff-count').textContent = d.inefficient_device_count ?? '—';
    document.getElementById('kpi-wasted').textContent      = d.total_wasted_kwh != null ? parseFloat(d.total_wasted_kwh).toFixed(1) + ' kWh' : '—';
    document.getElementById('kpi-worst-bld').textContent   = d.worst_building ?? '—';
    document.getElementById('kpi-degrading').textContent   = d.degrading_device_count ?? '—';
  } catch (e) { console.error('KPI error:', e); }
}

// ---- Building filter ----
async function populateBuildingFilter() {
  try {
    const buildings = await API.buildings();
    const sel = document.getElementById('ineff-building-filter');
    buildings.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.building_id;
      opt.textContent = b.building_name;
      sel.appendChild(opt);
    });
  } catch {}
}

// ---- Inefficient Devices Table ----
async function loadInefficientDevices() {
  const tbody     = document.getElementById('ineff-tbody');
  const buildingId = document.getElementById('ineff-building-filter').value || null;
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.inefficientDevices(buildingId);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-row" style="color:var(--green)">✓ No inefficient devices found</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const eff     = parseFloat(r.efficiency_pct || 0);
      const wasted  = parseFloat(r.wasted_kwh || 0);
      const barW    = Math.min(eff, 100);
      const barColor= eff >= 70 ? '#f0a500' : eff >= 50 ? '#f05050' : '#c81e1e';
      return `
        <tr>
          <td><strong>${r.device_name}</strong></td>
          <td>${r.building_name}</td>
          <td><span class="mono">${r.device_type}</span></td>
          <td class="num">${parseFloat(r.actual_kwh || 0).toFixed(1)}</td>
          <td class="num">${parseFloat(r.expected_kwh || 0).toFixed(1)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="num" style="min-width:40px;color:${barColor}">${eff.toFixed(1)}%</span>
              <div class="efficiency-bar-wrap" style="width:60px">
                <div class="efficiency-bar" style="width:${barW}%;background:${barColor}"></div>
              </div>
            </div>
          </td>
          <td class="${wasted > 0 ? 'wasted-cell' : 'num'}">${wasted > 0 ? '+' + wasted.toFixed(1) : '—'}</td>
          <td class="num">${r.days_measured}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

// ---- Degradation Table ----
async function loadDegradation() {
  const tbody    = document.getElementById('deg-tbody');
  const minRatio = parseFloat(document.getElementById('deg-ratio').value) || 1.15;
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.degradation(minRatio);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:var(--green)">✓ No devices degrading above ${minRatio.toFixed(2)}x threshold</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const ratio   = parseFloat(r.degradation_ratio || 1);
      const sev     = (r.severity || '').toLowerCase();
      const barW    = Math.min((ratio - 1) * 100, 100);
      const barCol  = sev === 'critical' ? '#f05050' : sev === 'high' ? '#f0a500' : '#4db8ff';
      return `
        <tr>
          <td><strong>${r.device_name}</strong></td>
          <td>${r.building_name}</td>
          <td><span class="mono">${r.device_type}</span></td>
          <td class="num">${parseFloat(r.recent_avg_kwh || 0).toFixed(2)}</td>
          <td class="num">${parseFloat(r.baseline_avg_kwh || 0).toFixed(2)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="num" style="min-width:36px;color:${barCol}">${ratio.toFixed(2)}x</span>
              <div class="ratio-bar-bg">
                <div class="ratio-bar-fill" style="width:${barW}%;background:${barCol}"></div>
              </div>
            </div>
          </td>
          <td><span class="status-badge sev-${sev}">${r.severity}</span></td>
          <td class="num">${r.months_installed ?? '—'}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

// ---- Weekend Cards ----
async function loadWeekendData() {
  const grid = document.getElementById('weekend-grid');
  try {
    const rows = await API.weekendAnomalies();
    if (!rows.length) {
      grid.innerHTML = '<div class="loading-row">No weekend data available</div>';
      return;
    }
    const maxWkd = Math.max(...rows.map(r => parseFloat(r.avg_weekday_kwh || 0)));
    grid.innerHTML = rows.map(r => {
      const wkdayH = 50 * (parseFloat(r.avg_weekday_kwh || 0) / Math.max(maxWkd, 0.01));
      const wkendH = 50 * (parseFloat(r.avg_weekend_kwh || 0) / Math.max(maxWkd, 0.01));
      const pct    = parseFloat(r.weekend_as_pct_of_weekday || 0);
      const color  = pct > 80 ? '#f05050' : pct > 50 ? '#f0a500' : '#2dd4a0';
      return `
        <div class="weekend-card">
          <div class="weekend-card-header">
            <div>
              <div class="wk-name">${r.device_type}</div>
              <div class="wk-bld">${r.building_name}</div>
            </div>
            <div class="wk-pct" style="color:${color}">${pct.toFixed(0)}%</div>
          </div>
          <div class="wk-bars">
            <div class="wk-bar-wrap">
              <div class="wk-bar" style="height:${Math.max(wkdayH,4)}px;background:#4db8ff"></div>
              <div class="wk-bar-label">Weekday<br>${parseFloat(r.avg_weekday_kwh||0).toFixed(1)}</div>
            </div>
            <div class="wk-bar-wrap">
              <div class="wk-bar" style="height:${Math.max(wkendH,4)}px;background:${color}"></div>
              <div class="wk-bar-label">Weekend<br>${parseFloat(r.avg_weekend_kwh||0).toFixed(1)}</div>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`;
  }
}

// ---- Weekend Sweep ----
async function runWeekendSweep() {
  const threshold = parseInt(document.getElementById('sweep-threshold').value) || 70;
  const resultEl  = document.getElementById('sweep-result');
  resultEl.style.display = 'none';
  try {
    const res   = await API.weekendSweep(threshold);
    const count = res.result?.[0]?.weekend_anomalies_logged ?? 0;
    resultEl.textContent   = `✓ ${count} weekend anomal${count === 1 ? 'y' : 'ies'} logged as alerts`;
    resultEl.style.display = 'inline';
  } catch (e) {
    resultEl.textContent   = `Error: ${e.message}`;
    resultEl.style.color   = 'var(--red)';
    resultEl.style.display = 'inline';
  }
}

// ---- Efficiency Ranking ----
async function loadRanking(order, btn) {
  if (btn) {
    document.querySelectorAll('#tab-ranking .period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const tbody = document.getElementById('rank-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.efficiencyRanking(order, 20);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No data</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((r, i) => {
      const eff   = parseFloat(r.efficiency_pct || 0);
      const color = eff > 110 ? '#2dd4a0' : eff >= 90 ? '#4db8ff' : eff >= 70 ? '#f0a500' : eff >= 50 ? '#f05050' : '#c81e1e';
      return `
        <tr>
          <td class="num" style="color:var(--text-muted)">${i + 1}</td>
          <td><strong>${r.device_name}</strong></td>
          <td>${r.building_name}</td>
          <td><span class="mono">${r.device_type}</span></td>
          <td class="num" style="color:${color}">${eff.toFixed(1)}%</td>
          <td><span class="status-badge ${effBadgeCls(r.efficiency_label)}">${r.efficiency_label}</span></td>
          <td class="${parseFloat(r.wasted_kwh||0) > 0 ? 'wasted-cell' : 'num'}">
            ${parseFloat(r.wasted_kwh||0) > 0 ? '+' + parseFloat(r.wasted_kwh).toFixed(1) : '—'}
          </td>
        </tr>`;
    }).join('');

    buildRankingChart(rows.slice(0, 10));

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function buildRankingChart(rows) {
  const labels = rows.map(r => r.device_name.length > 14 ? r.device_name.slice(0,12)+'…' : r.device_name);
  const values = rows.map(r => parseFloat(r.efficiency_pct || 0));
  const colors = values.map(v => v >= 90 ? '#2dd4a0' : v >= 80 ? '#f0a500' : '#f05050');

  const canvas = document.getElementById('ranking-chart');
  canvas.style.height = '160px';

  const ctx = canvas.getContext('2d');
  if (rankingChart) rankingChart.destroy();
  rankingChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#181c22',
          borderColor: '#252c38',
          borderWidth: 1,
          titleColor: '#8a95a3',
          bodyColor: '#e8ecf0',
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)}% efficiency` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 9 }, maxRotation: 30 } },
        y: {
          grid: { color: '#1e2229' },
          ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 9 }, callback: v => v + '%' },
          min: 0, max: 130
        }
      }
    }
  });
}

// ---- Helpers ----
function effBadgeCls(label) {
  // HIGH score = good. LOW score = bad (over consuming).
  const s = (label || '').toUpperCase().replace(/ /g,'_');
  const map = {
    'EFFICIENT':      'status-normal',
    'NORMAL':         'status-normal',
    'MODERATE':       'status-moderate',
    'ACCEPTABLE':     'status-over',
    'INEFFICIENT':    'status-inefficient',
    'OVER_CONSUMING': 'status-inefficient',
    'OVER CONSUMING': 'status-inefficient',
    'NO_DATA':        'status-nodata'
  };
  return map[s] || 'status-nodata';
}