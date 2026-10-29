/**
 * api.js — EnergyIQ Central API Layer (Phase 3)
 */
const BASE_URL = 'http://localhost:5000';

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(BASE_URL + path, {
      headers: { 'Content-Type': 'application/json' }, ...options
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error(`API error [${path}]:`, err.message);
    throw err;
  }
}

const API = {
  // ---- Phase 1 ----
  summary:          () => apiFetch('/api/analytics/summary'),
  buildings:        () => apiFetch('/api/buildings'),
  buildingMonthly:  (y, m) => apiFetch(`/api/analytics/building-monthly?year=${y}&month=${m}`),
  trend:            (bId = null) => apiFetch(`/api/analytics/trend${bId ? '?building_id='+bId : ''}`),
  efficiency:       (bId = null) => apiFetch(`/api/analytics/efficiency${bId ? '?building_id='+bId : ''}`),
  alerts:           (resolved = false) => apiFetch(`/api/alerts?resolved=${resolved}`),
  resolveAlert:     (id) => apiFetch(`/api/alerts/${id}/resolve`, { method: 'POST' }),
  detectAnomalies:  (date) => apiFetch('/api/analytics/detect-anomalies', { method: 'POST', body: JSON.stringify({ date }) }),
  devices:          (bId = null) => apiFetch(`/api/devices${bId ? '?building_id='+bId : ''}`),
  buildingReport:   (bId, y, m) => apiFetch(`/api/analytics/building-report?building_id=${bId}&year=${y}&month=${m}`),
  addReading:       (dId, date, kwh) => apiFetch('/api/readings', { method: 'POST', body: JSON.stringify({ device_id: parseInt(dId), reading_date: date, energy_kwh: kwh }) }),

  // ---- Phase 2 ----
  trendMom:         (bId = null) => apiFetch(`/api/trend/mom${bId ? '?building_id='+bId : ''}`),
  trendReport:      (months = 6) => apiFetch(`/api/trend/report?months=${months}`),
  buildingScores:   () => apiFetch('/api/trend/building-score'),
  dailyByBuilding:  (days = 30) => apiFetch(`/api/trend/daily-by-building?days=${days}`),
  inefficientDevices:(bId = null) => apiFetch(`/api/inefficiency/devices${bId ? '?building_id='+bId : ''}`),
  weekendAnomalies: () => apiFetch('/api/inefficiency/weekend'),
  degradation:      (r = 1.15) => apiFetch(`/api/inefficiency/degradation?min_ratio=${r}`),
  weekendSweep:     (t = 70) => apiFetch('/api/inefficiency/weekend-sweep', { method: 'POST', body: JSON.stringify({ threshold_pct: t }) }),
  efficiencyRanking:(order = 'asc', limit = 20) => apiFetch(`/api/inefficiency/efficiency-ranking?order=${order}&limit=${limit}`),
  inefficiencySummary: () => apiFetch('/api/inefficiency/summary'),
  exportUrl:        (type, params = '') => `${BASE_URL}/api/export/${type}${params ? '?'+params : ''}`,

  // ---- Phase 3: Forecast ----
  generateForecasts:  () => apiFetch('/api/forecast/generate', { method: 'POST' }),
  forecastSummary:    (month = null, bId = null) => {
    const p = [month ? `month=${month}` : '', bId ? `building_id=${bId}` : ''].filter(Boolean).join('&');
    return apiFetch(`/api/forecast/summary${p ? '?'+p : ''}`);
  },
  buildingForecast:   () => apiFetch('/api/forecast/building'),
  forecastAccuracy:   (method = null) => apiFetch(`/api/forecast/accuracy${method ? '?method='+method : ''}`),
  updateAccuracy:     (month) => apiFetch('/api/forecast/update-accuracy', { method: 'POST', body: JSON.stringify({ forecast_month: month }) }),
  forecastMonths:     () => apiFetch('/api/forecast/months'),
  forecastKpis:       () => apiFetch('/api/forecast/kpis'),

  // ---- Phase 3: Thresholds ----
  thresholds:        (bId = null) => apiFetch(`/api/thresholds${bId ? '?building_id='+bId : ''}`),
  thresholdStatus:   () => apiFetch('/api/thresholds/status'),
  createThreshold:   (data) => apiFetch('/api/thresholds', { method: 'POST', body: JSON.stringify(data) }),
  updateThreshold:   (id, data) => apiFetch(`/api/thresholds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  checkThresholds:   (date) => apiFetch('/api/thresholds/check', { method: 'POST', body: JSON.stringify({ date }) }),

  // ---- Phase 3: Reports ----
  schedules:         () => apiFetch('/api/reports/schedules'),
  createSchedule:    (data) => apiFetch('/api/reports/schedules', { method: 'POST', body: JSON.stringify(data) }),
  toggleSchedule:    (id) => apiFetch(`/api/reports/schedules/${id}/toggle`, { method: 'POST' }),
  deleteSchedule:    (id) => apiFetch(`/api/reports/schedules/${id}`, { method: 'DELETE' }),
  runReport:         (id) => `${BASE_URL}/api/reports/run/${id}`,  // returns download URL
  runReportFetch:    (id) => apiFetch(`/api/reports/run/${id}`, { method: 'POST' }),
  reportHistory:     (scheduleId = null) => apiFetch(`/api/reports/history${scheduleId ? '?schedule_id='+scheduleId : ''}`)
};