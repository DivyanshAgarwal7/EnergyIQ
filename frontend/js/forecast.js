/**
 * forecast.js — EnergyIQ Forecast Page (Phase 3)
 */

let forecastChart = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('export-forecast-btn').href = API.exportUrl('forecast');
  populateBuildingFilter();
  loadForecastKpis();
  loadForecastChart();
  loadForecastTable();
  loadThresholds();
  loadAccuracy();
});

// ---- Tab switching ----
function showTab(tab) {
  ['devices','thresholds','accuracy'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById(`stab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

// ---- Building filter ----
async function populateBuildingFilter() {
  try {
    const buildings = await API.buildings();
    const sel = document.getElementById('fcst-building-filter');
    buildings.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.building_id;
      opt.textContent = b.building_name;
      sel.appendChild(opt);
    });
  } catch {}
}

// ---- KPI Cards ----
async function loadForecastKpis() {
  try {
    const d = await API.forecastKpis();
    setText('kpi-next-month',     d.next_month_label       ?? '—');
    setText('kpi-predicted-total', d.next_month_total_kwh != null
      ? fmtKwh(d.next_month_total_kwh) : '—');
    setText('kpi-devices-fcst',   d.devices_forecasted     ?? '—');
    setText('kpi-confidence',     d.avg_confidence_pct != null
      ? d.avg_confidence_pct + '%' : '—');
    setText('kpi-hist-error',     d.historical_avg_error_pct != null
      ? d.historical_avg_error_pct + '%' : '—');
  } catch (e) { console.error('Forecast KPI error:', e); }
}

// ---- Building Forecast Chart ----
async function loadForecastChart() {
  try {
    const rows = await API.buildingForecast();
    if (!rows.length) return;

    // Group by building, show all months
    const buildings = {};
    const monthsSet = new Set();
    rows.forEach(r => {
      if (!buildings[r.building_name]) buildings[r.building_name] = {};
      buildings[r.building_name][r.forecast_label] = parseFloat(r.predicted_kwh || 0);
      monthsSet.add(r.forecast_label);
    });

    const months   = [...monthsSet].sort();
    const bNames   = Object.keys(buildings);
    const colors   = ['#2dd4a0','#4db8ff','#f0a500','#c084fc','#f05050','#fb923c'];
    const datasets = bNames.map((name, i) => ({
      label: name,
      data: months.map(m => buildings[name][m] ?? null),
      backgroundColor: colors[i % colors.length] + '33',
      borderColor:     colors[i % colors.length],
      borderWidth: 2,
      borderRadius: 5,
    }));

    const ctx = document.getElementById('forecast-chart').getContext('2d');
    if (forecastChart) forecastChart.destroy();
    forecastChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: months, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color:'#8a95a3', font:{ family:'DM Sans', size:11 }, boxWidth:10, boxHeight:10, padding:16 }
          },
          tooltip: {
            backgroundColor:'#181c22', borderColor:'#252c38', borderWidth:1,
            titleColor:'#8a95a3', bodyColor:'#e8ecf0',
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) || '—'} kWh` }
          }
        },
        scales: {
          x: { grid:{ color:'#1e2229' }, ticks:{ color:'#8a95a3', font:{ family:'DM Sans', size:11 } } },
          y: { grid:{ color:'#1e2229' }, ticks:{ color:'#4d5a6a', font:{ family:'DM Mono', size:10 }, callback: v => v + ' kWh' } }
        }
      }
    });
  } catch (e) { console.error('Forecast chart error:', e); }
}

// ---- Generate Forecasts ----
async function generateForecasts() {
  const btn = document.getElementById('gen-btn');
  btn.classList.add('loading');
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    const res = await API.generateForecasts();
    btn.textContent = '✓ Generated';
    btn.classList.remove('loading');
    btn.disabled = false;

    // Small delay then reload everything
    await new Promise(r => setTimeout(r, 400));
    await Promise.allSettled([
      loadForecastKpis(),
      loadForecastChart(),
      loadForecastTable()
    ]);

    // Reset button
    setTimeout(() => { btn.textContent = 'Generate Forecasts'; }, 2000);

  } catch (e) {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.textContent = 'Generate Forecasts';

    // Show the actual error message so user knows what went wrong
    const msg = e.message || 'Unknown error';
    console.error('Forecast generation failed:', msg);

    // Show inline error under the button instead of alert
    let errEl = document.getElementById('gen-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.id = 'gen-error';
      errEl.style.cssText = 'color:var(--red);font-size:0.8rem;font-family:DM Mono,monospace;margin-top:8px';
      btn.parentNode.insertBefore(errEl, btn.nextSibling);
    }
    errEl.textContent = 'Error: ' + msg;
    setTimeout(() => { if (errEl) errEl.textContent = ''; }, 8000);
  }
}

// ---- Forecast Table ----
async function loadForecastTable() {
  const tbody     = document.getElementById('forecast-tbody');
  const buildingId = document.getElementById('fcst-building-filter').value || null;
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.forecastSummary(null, buildingId);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No forecast data — click "Generate Forecasts"</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const ma    = r.ma_predicted_kwh     != null ? parseFloat(r.ma_predicted_kwh).toFixed(1)     : '—';
      const trend = r.trend_predicted_kwh  != null ? parseFloat(r.trend_predicted_kwh).toFixed(1)  : '—';
      const seas  = r.seasonal_predicted_kwh != null ? parseFloat(r.seasonal_predicted_kwh).toFixed(1) : '—';
      const ens   = r.ensemble_predicted_kwh != null ? parseFloat(r.ensemble_predicted_kwh).toFixed(1) : '—';
      const conf  = r.ma_confidence != null ? parseFloat(r.ma_confidence) : null;
      const confW = conf != null ? Math.min(conf, 100) : 0;
      return `
        <tr>
          <td><strong>${r.device_name}</strong></td>
          <td>${r.building_name}</td>
          <td><span class="mono">${r.device_type}</span></td>
          <td class="num col-ma">${ma}</td>
          <td class="num col-trend">${trend}</td>
          <td class="num col-seas">${seas}</td>
          <td class="num col-ens">${ens}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="mono" style="min-width:36px;font-size:0.75rem">${conf != null ? conf.toFixed(0)+'%' : '—'}</span>
              <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${confW}%"></div></div>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

// ---- Threshold Gauge Cards ----
async function loadThresholds() {
  const grid = document.getElementById('threshold-grid');
  try {
    const rows = await API.thresholdStatus();
    if (!rows.length) {
      grid.innerHTML = '<div class="loading-row">No device-level thresholds configured</div>';
      return;
    }
    grid.innerHTML = rows.map(r => {
      const pct    = parseFloat(r.utilisation_pct || 0);
      const cls    = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'ok';
      const color  = pct >= 90 ? '#f05050' : pct >= 70 ? '#f0a500' : '#2dd4a0';
      const width  = Math.min(pct, 100);
      const avg    = r.current_month_avg_daily != null ? parseFloat(r.current_month_avg_daily).toFixed(1) : '—';
      return `
        <div class="threshold-card ${cls}">
          <div class="tc-name" title="${r.device_name}">${r.device_name}</div>
          <div class="tc-bld">${r.building_name} · ${r.device_type}</div>
          <div class="tc-pct" style="color:${color}">${pct > 0 ? pct.toFixed(0) + '%' : '—'}</div>
          <div class="tc-gauge-bg">
            <div class="tc-gauge-fill" style="width:${width}%;background:${color}"></div>
          </div>
          <div class="tc-meta">
            <span>Avg: ${avg} kWh/day</span>
            <span>Limit: ${r.threshold_kwh} kWh</span>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="loading-row">Error: ${e.message}</div>`;
  }
}

async function checkThresholdsNow() {
  const result = document.getElementById('threshold-check-result');
  const today  = new Date().toISOString().split('T')[0];
  result.style.display = 'none';
  try {
    const res   = await API.checkThresholds(today);
    const count = res.result?.[0]?.new_alerts_fired ?? 0;
    result.textContent   = `✓ ${count} threshold alert${count === 1 ? '' : 's'} fired for today`;
    result.style.display = 'inline';
  } catch (e) {
    result.textContent   = `Error: ${e.message}`;
    result.style.color   = 'var(--red)';
    result.style.display = 'inline';
  }
}

// ---- Forecast Accuracy ----
async function loadAccuracy() {
  const tbody  = document.getElementById('accuracy-tbody');
  const empty  = document.getElementById('accuracy-empty');
  const method = document.getElementById('acc-method-filter').value || null;
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const rows = await API.forecastAccuracy(method);

    if (!rows.length) {
      if (empty) empty.style.display = 'block';
      tbody.innerHTML = `
        <tr><td colspan="8" class="loading-row" style="color:var(--text-muted)">
          No accuracy data yet.<br>
          Accuracy is only available after a forecast month has ended.
          Run <code style="color:var(--accent)">CALL sp_update_forecast_accuracy('YYYY-MM-01');</code>
          in Workbench after a month completes.
        </td></tr>`;
      return;
    }

    if (empty) empty.style.display = 'none';
    tbody.innerHTML = rows.map(r => {
      const err   = r.error_pct != null ? parseFloat(r.error_pct).toFixed(1) + '%' : '—';
      const label = (r.accuracy_label || '').toLowerCase();
      const methodColor = r.method === 'MOVING_AVG' ? 'col-ma' :
                          r.method === 'TREND_EXTRAPOLATION' ? 'col-trend' : 'col-seas';
      return `
        <tr>
          <td class="${methodColor} mono" style="font-size:0.78rem">${r.method.replace('_',' ')}</td>
          <td><strong>${r.device_name}</strong></td>
          <td>${r.building_name}</td>
          <td class="mono">${r.month}</td>
          <td class="num">${parseFloat(r.predicted_kwh||0).toFixed(1)}</td>
          <td class="num">${parseFloat(r.actual_kwh||0).toFixed(1)}</td>
          <td class="num">${err}</td>
          <td><span class="status-badge acc-${label}">${r.accuracy_label}</span></td>
        </tr>`;
    }).join('');
  } catch (e) {
    // Pool exhausted or connection error — show friendly message
    tbody.innerHTML = `
      <tr><td colspan="8" class="loading-row" style="color:var(--text-muted)">
        Could not load accuracy data. If Flask just started, wait a moment and try again.
        <br>Details: ${e.message}
      </td></tr>`;
  }
}

// ---- Helpers ----
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function fmtKwh(v) {
  const n = parseFloat(v);
  return n >= 1000 ? (n/1000).toFixed(1)+' MWh' : n.toFixed(1)+' kWh';
}