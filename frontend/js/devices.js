/**
 * devices.js — EnergyIQ Devices Page
 */

let allDevices = [];

document.addEventListener('DOMContentLoaded', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  document.getElementById('reading-date').value = yesterday.toISOString().split('T')[0];

  populateBuildingFilter();
  loadDevices();
});

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

async function loadDevices() {
  const tbody      = document.getElementById('devices-tbody');
  const buildingId = document.getElementById('building-filter').value || null;
  tbody.innerHTML  = '<tr><td colspan="6" class="loading-row">Loading...</td></tr>';

  try {
    allDevices = await API.devices(buildingId);
    document.getElementById('device-count').textContent = `${allDevices.length} devices`;

    // Populate the reading form dropdown
    const devSel = document.getElementById('reading-device');
    devSel.innerHTML = '<option value="">Select device...</option>';
    allDevices.filter(d => d.is_active).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.device_id;
      opt.textContent = `${d.device_name} (${d.building_name})`;
      devSel.appendChild(opt);
    });

    if (!allDevices.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No devices found</td></tr>';
      return;
    }

    tbody.innerHTML = allDevices.map(d => {
      const active = d.is_active;
      return `
        <tr>
          <td>
            <span class="active-dot ${active ? '' : 'inactive-dot'}"></span>
            <span style="font-size:0.78rem;color:${active ? 'var(--green)' : 'var(--text-muted)'}">
              ${active ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td><strong>${d.device_name}</strong></td>
          <td>${d.building_name}</td>
          <td><span class="mono">${d.device_type}</span></td>
          <td class="num">${d.rated_power_kw} kW</td>
          <td class="mono">${d.installed_on || '—'}</td>
        </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

async function submitReading() {
  const deviceId = document.getElementById('reading-device').value;
  const date     = document.getElementById('reading-date').value;
  const kwh      = parseFloat(document.getElementById('reading-kwh').value);
  const result   = document.getElementById('reading-result');

  result.style.display = 'none';

  if (!deviceId || !date || isNaN(kwh) || kwh < 0) {
    showResult('Please fill in all fields with valid values.', 'error');
    return;
  }

  try {
    await API.addReading(deviceId, date, kwh);
    showResult(`✓ Reading saved: ${kwh} kWh for device #${deviceId} on ${date}`, 'success');
    document.getElementById('reading-kwh').value = '';
  } catch (e) {
    showResult(`Error: ${e.message}`, 'error');
  }
}

function showResult(msg, type) {
  const el = document.getElementById('reading-result');
  el.textContent  = msg;
  el.className    = `form-result ${type}`;
  el.style.display = 'block';
}