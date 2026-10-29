/**
 * dashboard.js — EnergyIQ Dashboard
 * Handles KPI cards, trend chart, building chart, table, alerts
 */

// ---- State ----
let trendChart    = null;
let buildingChart = null;

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  setDateDefaults();
  loadAll();
});

function setDateDefaults() {
  const now = new Date();
  document.getElementById('current-date').textContent =
    now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const monthSel = document.getElementById('month-select');
  const yearSel  = document.getElementById('year-select');
  monthSel.value = now.getMonth() + 1;
  // Set current year if option exists, else default to first option
  for (let opt of yearSel.options) {
    if (parseInt(opt.value) === now.getFullYear()) {
      yearSel.value = opt.value;
      break;
    }
  }
}

function getSelectedPeriod() {
  return {
    year:  parseInt(document.getElementById('year-select').value),
    month: parseInt(document.getElementById('month-select').value)
  };
}

// ---- Load Everything ----
async function loadAll() {
  const { year, month } = getSelectedPeriod();
  updateTableMonthLabel(year, month);

  // Fire all requests in parallel
  await Promise.allSettled([
    loadSummary(),
    loadTrendChart(),
    loadBuildingChart(year, month),
    loadBuildingTable(year, month),
    loadAlerts()
  ]);
}

// ---- KPI Summary ----
async function loadSummary() {
  try {
    const d = await API.summary();
    setText('kpi-buildings',  d.total_buildings  ?? '—');
    setText('kpi-devices',    d.active_devices   ?? '—');
    setText('kpi-kwh',        d.this_month_kwh != null ? formatKwh(d.this_month_kwh) : '—');
    setText('kpi-efficiency', d.avg_efficiency_pct != null ? d.avg_efficiency_pct + '%' : '—');
    setText('kpi-alerts',     d.open_alerts      ?? '—');

    // Update sidebar badge
    const badge = document.getElementById('alert-badge');
    if (badge && d.open_alerts > 0) {
      badge.textContent = d.open_alerts;
      badge.style.display = 'inline-block';
    }
  } catch {
    ['kpi-buildings','kpi-devices','kpi-kwh','kpi-efficiency','kpi-alerts']
      .forEach(id => setText(id, 'Error'));
  }
}

// ---- 30-Day Trend Chart ----
async function loadTrendChart() {
  try {
    const rows = await API.trend();
    const labels = rows.map(r => formatDateShort(r.reading_date));
    const values = rows.map(r => parseFloat(r.total_kwh));

    const ctx = document.getElementById('trend-chart').getContext('2d');
    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total kWh',
          data: values,
          borderColor: '#f0a500',
          backgroundColor: 'rgba(240,165,0,0.08)',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#f0a500',
          fill: true,
          tension: 0.35
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
            callbacks: {
              label: ctx => ` ${ctx.parsed.y.toFixed(1)} kWh`
            }
          }
        },
        scales: {
          x: {
            grid:  { color: '#1e2229', drawBorder: false },
            ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 },
                     maxTicksLimit: 10, maxRotation: 0 }
          },
          y: {
            grid:  { color: '#1e2229', drawBorder: false },
            ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 },
                     callback: v => v.toFixed(0) + ' kWh' }
          }
        }
      }
    });
  } catch (e) {
    showChartError('trend-chart', 'Could not load trend data');
  }
}

// ---- Building Comparison Chart ----
async function loadBuildingChart(year, month) {
  try {
    const rows = await API.buildingMonthly(year, month);
    const labels = rows.map(r => shortName(r.building_name));
    const values = rows.map(r => parseFloat(r.total_kwh));

    const colors = ['#f0a500','#2dd4a0','#4db8ff','#f05050','#c084fc'];

    const ctx = document.getElementById('building-chart').getContext('2d');
    if (buildingChart) buildingChart.destroy();

    buildingChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'kWh',
          data: values,
          backgroundColor: colors.slice(0, values.length),
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#181c22',
            borderColor: '#252c38',
            borderWidth: 1,
            titleColor: '#8a95a3',
            bodyColor: '#e8ecf0',
            callbacks: {
              label: ctx => ` ${ctx.parsed.x.toFixed(1)} kWh`
            }
          }
        },
        scales: {
          x: {
            grid:  { color: '#1e2229', drawBorder: false },
            ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 } }
          },
          y: {
            grid:  { display: false },
            ticks: { color: '#8a95a3', font: { family: 'DM Sans', size: 11 } }
          }
        }
      }
    });
  } catch {
    showChartError('building-chart', 'Could not load building data');
  }
}

// ---- Building Table ----
async function loadBuildingTable(year, month) {
  const tbody = document.getElementById('building-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.buildingMonthly(year, month);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No data for this period</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const kwh      = parseFloat(r.total_kwh   || 0).toFixed(1);
      const perSqft  = parseFloat(r.kwh_per_sqft || 0).toFixed(3);
      const status   = intensityStatus(r.kwh_per_sqft);
      return `
        <tr>
          <td><strong>${r.building_name}</strong></td>
          <td><span class="mono">${r.building_type}</span></td>
          <td class="num">${formatKwh(kwh)}</td>
          <td class="num">${perSqft}</td>
          <td class="num">${r.active_devices}</td>
          <td>${statusBadge(status)}</td>
        </tr>`;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Failed to load data</td></tr>';
  }
}

// ---- Alerts ----
async function loadAlerts() {
  const container = document.getElementById('alerts-container');
  try {
    const alerts = await API.alerts(false);
    if (!alerts.length) {
      container.innerHTML = '<div class="loading-row">No open alerts ✓</div>';
      return;
    }
    // Show max 5 on dashboard
    container.innerHTML = alerts.slice(0, 5).map(a => alertItem(a)).join('');
  } catch {
    container.innerHTML = '<div class="loading-row">Failed to load alerts</div>';
  }
}

function alertItem(a) {
  const typeClass = a.alert_type === 'SPIKE' ? 'spike'
    : a.alert_type === 'OVER_CONSUMPTION'    ? 'over' : 'weekend';
  const tagClass  = a.alert_type === 'SPIKE' ? 'tag-spike'
    : a.alert_type === 'OVER_CONSUMPTION'    ? 'tag-over' : 'tag-other';

  return `
    <div class="alert-item ${typeClass}">
      <span class="alert-type-tag ${tagClass}">${a.alert_type.replace('_',' ')}</span>
      <div class="alert-body">
        <div class="alert-device">${a.device_name} — ${a.building_name}</div>
        <div class="alert-message">${a.message || '—'}</div>
        <div class="alert-meta">${formatDateTime(a.created_at)}</div>
      </div>
      <button class="btn-sm" onclick="resolveAlert(${a.alert_id}, this)">Resolve</button>
    </div>`;
}

async function resolveAlert(alertId, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await API.resolveAlert(alertId);
    btn.closest('.alert-item').style.opacity = '0.4';
    btn.textContent = 'Done';
    // Reload summary to update count
    loadSummary();
  } catch {
    btn.textContent = 'Error';
    btn.disabled = false;
  }
}

// ---- Helpers ----
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatKwh(v) {
  const n = parseFloat(v);
  if (n >= 1000) return (n / 1000).toFixed(1) + ' MWh';
  return n.toFixed(1) + ' kWh';
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function formatDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit' });
}

function shortName(name) {
  // Truncate long building names for chart labels
  return name.length > 18 ? name.slice(0, 16) + '…' : name;
}

function updateTableMonthLabel(year, month) {
  const el = document.getElementById('table-month-label');
  if (!el) return;
  const d = new Date(year, month - 1, 1);
  el.textContent = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function intensityStatus(kwh_per_sqft) {
  const v = parseFloat(kwh_per_sqft);
  if (isNaN(v))   return 'NO_DATA';
  if (v > 0.05)   return 'HIGH';
  if (v > 0.02)   return 'MODERATE';
  return 'LOW';
}

function statusBadge(status) {
  const map = {
    'LOW':      ['status-normal',      'Low'],
    'MODERATE': ['status-over',        'Moderate'],
    'HIGH':     ['status-inefficient', 'High'],
    'NO_DATA':  ['status-nodata',      'No data']
  };
  const [cls, label] = map[status] || ['status-nodata', status];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function showChartError(canvasId, msg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4d5a6a';
  ctx.font = '13px DM Sans';
  ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}