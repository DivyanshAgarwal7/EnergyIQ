/**
 * trend.js — EnergyIQ Trend Analysis Page (Phase 2)
 */

let multiTrendChart = null;
let momChart        = null;
let intensityChart  = null;
let currentMonths   = 6;

const BUILDING_COLORS = ['#f0a500','#2dd4a0','#4db8ff','#f05050','#c084fc','#fb923c'];

document.addEventListener('DOMContentLoaded', () => {
  updateExportUrl();
  Promise.allSettled([
    loadBuildingScores(),
    loadMomTable(),
    loadDailyByBuilding(),
    loadIntensityChart()
  ]);
});

function setPeriod(months, btn) {
  currentMonths = months;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateExportUrl();
  loadMomTable();
}

function updateExportUrl() {
  const btn = document.getElementById('export-trend-btn');
  if (btn) btn.href = API.exportUrl('trend', `months=${currentMonths}`);
}

// ---- Building Efficiency Score Cards ----
async function loadBuildingScores() {
  const grid = document.getElementById('score-grid');
  try {
    const rows = await API.buildingScores();
    if (!rows.length) {
      grid.innerHTML = '<div class="loading-row">No score data</div>';
      return;
    }
    grid.innerHTML = rows.map(r => {
      const score   = r.efficiency_score != null ? parseFloat(r.efficiency_score) : null;
      const display = score != null ? score.toFixed(1) + '%' : '—';
      const color   = scoreColor(score);
      const width   = score != null ? Math.min(score, 130) : 0;
      const label   = r.efficiency_label || '—';
      return `
        <div class="score-card">
          <div class="score-card-name" title="${r.building_name}">${r.building_name}</div>
          <div class="score-card-type">${r.building_type} · ${r.active_devices} devices</div>
          <div class="score-ring-wrap">
            <div>
              <div class="score-num" style="color:${color}">${display}</div>
              <div class="score-label-small">${label}</div>
            </div>
          </div>
          <div class="score-bar-bg">
            <div class="score-bar-fill" style="width:${width}%;background:${color}"></div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`;
  }
}

// ---- Month-over-Month Table ----
async function loadMomTable() {
  const tbody = document.getElementById('mom-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.trendReport(currentMonths);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No data</td></tr>';
      return;
    }

    // Get MoM data
    const momRows = await API.trendMom();
    const momMap  = {};
    momRows.forEach(r => {
      momMap[`${r.building_id}_${r.yr}_${r.mo}`] = r;
    });

    tbody.innerHTML = rows.map(r => {
      const key    = `${r.building_id}_${r.yr}_${r.mo}`;
      const mom    = momMap[key];
      const change = mom ? parseFloat(mom.mom_change_pct) : null;
      return `
        <tr>
          <td><strong>${r.building_name}</strong></td>
          <td><span class="mono">${r.building_type}</span></td>
          <td class="mono">${r.month_label}</td>
          <td class="num">${parseFloat(r.total_kwh).toFixed(1)}</td>
          <td class="num">${mom && mom.prev_month_kwh ? parseFloat(mom.prev_month_kwh).toFixed(1) : '—'}</td>
          <td>${momChip(change)}</td>
        </tr>`;
    }).join('');

    // Build MoM bar chart from latest month per building
    buildMomChart(rows, momMap);

  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function buildMomChart(rows, momMap) {
  // Get latest entry per building
  const latest = {};
  rows.forEach(r => {
    const key = r.building_id;
    if (!latest[key] || r.yr > latest[key].yr || (r.yr === latest[key].yr && r.mo > latest[key].mo)) {
      const momKey = `${r.building_id}_${r.yr}_${r.mo}`;
      latest[key] = { ...r, mom: momMap[momKey] };
    }
  });

  const entries  = Object.values(latest);
  const labels   = entries.map(e => shortName(e.building_name));
  const changes  = entries.map(e => e.mom ? parseFloat(e.mom.mom_change_pct || 0) : 0);
  const barColors= changes.map(c => c > 0 ? '#f05050' : '#2dd4a0');

  const ctx = document.getElementById('mom-chart').getContext('2d');
  if (momChart) momChart.destroy();
  momChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'MoM Change %',
        data: changes,
        backgroundColor: barColors,
        borderRadius: 5,
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
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return ` ${v > 0 ? '+' : ''}${v.toFixed(1)}% vs prev month`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8a95a3', font: { family: 'DM Sans', size: 11 } } },
        y: {
          grid: { color: '#1e2229', drawBorder: false },
          ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 }, callback: v => v + '%' }
        }
      }
    }
  });
}

// ---- Multi-Building Daily Line Chart ----
async function loadDailyByBuilding() {
  const days = parseInt(document.getElementById('days-select').value) || 30;
  try {
    const rows = await API.dailyByBuilding(days);

    // Group by building
    const buildings = {};
    const datesSet  = new Set();
    rows.forEach(r => {
      const key = r.building_name;
      if (!buildings[key]) buildings[key] = {};
      buildings[key][r.reading_date] = parseFloat(r.total_kwh);
      datesSet.add(r.reading_date);
    });

    const dates    = [...datesSet].sort();
    const labels   = dates.map(d => fmtDateShort(d));
    const bNames   = Object.keys(buildings);
    const datasets = bNames.map((name, i) => ({
      label: name,
      data: dates.map(d => buildings[name][d] || null),
      borderColor: BUILDING_COLORS[i % BUILDING_COLORS.length],
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 1.5,
      pointHoverRadius: 4,
      tension: 0.35,
      spanGaps: true
    }));

    const ctx = document.getElementById('multi-trend-chart').getContext('2d');
    if (multiTrendChart) multiTrendChart.destroy();
    multiTrendChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#8a95a3',
              font: { family: 'DM Sans', size: 11 },
              boxWidth: 12, boxHeight: 2, padding: 16
            }
          },
          tooltip: {
            backgroundColor: '#181c22',
            borderColor: '#252c38',
            borderWidth: 1,
            titleColor: '#8a95a3',
            bodyColor: '#e8ecf0',
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) || '—'} kWh` }
          }
        },
        scales: {
          x: { grid: { color: '#1e2229' }, ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 12, maxRotation: 0 } },
          y: { grid: { color: '#1e2229' }, ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 }, callback: v => v + ' kWh' } }
        }
      }
    });
  } catch (e) {
    console.error('Multi-trend chart error:', e);
  }
}

// ---- Intensity Chart ----
async function loadIntensityChart() {
  try {
    const now   = new Date();
    const rows  = await API.buildingMonthly(now.getFullYear(), now.getMonth() + 1);
    const labels = rows.map(r => shortName(r.building_name));
    const values = rows.map(r => parseFloat(r.kwh_per_sqft || 0));

    const ctx = document.getElementById('intensity-chart').getContext('2d');
    if (intensityChart) intensityChart.destroy();
    intensityChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'kWh/sqft',
          data: values,
          backgroundColor: values.map(v => v > 0.05 ? '#f05050' : v > 0.02 ? '#f0a500' : '#2dd4a0'),
          borderRadius: 5,
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
            callbacks: { label: ctx => ` ${ctx.parsed.x.toFixed(4)} kWh/sqft` }
          }
        },
        scales: {
          x: { grid: { color: '#1e2229' }, ticks: { color: '#4d5a6a', font: { family: 'DM Mono', size: 10 } } },
          y: { grid: { display: false }, ticks: { color: '#8a95a3', font: { family: 'DM Sans', size: 11 } } }
        }
      }
    });
  } catch (e) { console.error('Intensity chart error:', e); }
}

// ---- Helpers ----
function scoreColor(score) {
  // efficiency_pct = expected / actual * 100. High = good, Low = bad.
  if (score == null)  return '#4d5a6a';
  if (score > 110)    return '#2dd4a0';  // EFFICIENT   — actual < expected
  if (score >= 90)    return '#4db8ff';  // NORMAL      — within range
  if (score >= 70)    return '#f0a500';  // MODERATE    — 10-30% over
  if (score >= 50)    return '#f05050';  // INEFFICIENT — 30-50% over
  return '#c81e1e';                      // OVER CONSUMING — severely bad
}

function momChip(change) {
  if (change == null || isNaN(change)) return '<span class="mom-chip mom-flat">—</span>';
  const sign  = change > 0 ? '▲' : change < 0 ? '▼' : '—';
  const cls   = change > 0 ? 'mom-up' : change < 0 ? 'mom-down' : 'mom-flat';
  const label = change === 0 ? 'flat' : `${Math.abs(change).toFixed(1)}%`;
  return `<span class="mom-chip ${cls}">${sign} ${label}</span>`;
}

function shortName(name) {
  return name.length > 20 ? name.slice(0, 18) + '…' : name;
}

function fmtDateShort(str) {
  const d = new Date(str);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}