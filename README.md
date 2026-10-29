# EnergyIQ — Energy Consumption & Efficiency Analytics
**Stack:** Python + Flask · MySQL · HTML/CSS/JS (Chart.js)
**Current:** Phase 2 (complete)

---

## Setup — Run SQL files in this exact order

### Fresh install (Phase 1 + 2 together):
```
01_schema.sql
02_views.sql
03_functions.sql
04_procedures.sql
05_triggers.sql
06_seed_data.sql
07_phase2_views.sql        ← Phase 2
08_phase2_procedures.sql   ← Phase 2
```

### Already have Phase 1 running? Just run:
```
07_phase2_views.sql
08_phase2_procedures.sql
```

### Start Flask:
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Edit backend/config.py with your MySQL credentials first.

---

## Pages

| Page | File | What it shows |
|------|------|---------------|
| Dashboard | index.html | KPIs, 30-day trend, building chart, alerts preview |
| Analytics | analytics.html | Efficiency table, building report, anomaly detection |
| Alerts | alerts.html | Open/resolved alerts, inline resolve |
| Devices | devices.html | Device registry, add reading form |
| Trend (P2) | trend.html | Building scores, MoM table+chart, multi-building lines, intensity |
| Inefficiency (P2) | inefficiency.html | Below-80% devices, degradation, weekend anomalies, ranking |

---

## Database Objects Added in Phase 2

### Views (4 new)
- vw_mom_trend          — month-over-month with LAG() window function
- vw_inefficient_devices — devices < 80% + wasted kWh calculation
- vw_weekend_vs_weekday — weekend/weekday consumption ratio per type
- vw_device_degradation — devices consuming 15%+ more than 30-60d baseline

### Procedures (4 new)
- sp_trend_report(months)               — rolling multi-month trend
- sp_efficiency_ranking(order, limit)   — best/worst device ranking
- sp_weekend_anomaly_sweep(threshold)   — logs weekend anomaly alerts
- sp_degradation_report(min_ratio)      — severity-scored degradation

### Function (1 new)
- fn_building_efficiency(building_id)   — overall building efficiency score

### Trigger (1 new)
- trg_degradation_check  — auto DEGRADATION alert when ratio >= 1.3

---

## Phase 2 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/trend/mom | Month-over-month per building |
| GET | /api/trend/report?months=6 | Rolling trend stored proc |
| GET | /api/trend/building-score | fn_building_efficiency per building |
| GET | /api/trend/daily-by-building?days=30 | Per-building daily lines |
| GET | /api/inefficiency/devices | Devices below 80% |
| GET | /api/inefficiency/weekend | Weekend vs weekday ratios |
| GET | /api/inefficiency/degradation?min_ratio=1.15 | Degradation report |
| POST | /api/inefficiency/weekend-sweep | Run sp_weekend_anomaly_sweep |
| GET | /api/inefficiency/efficiency-ranking | sp_efficiency_ranking |
| GET | /api/inefficiency/summary | Phase 2 KPI cards |
| GET | /api/export/building-monthly | CSV download |
| GET | /api/export/efficiency | CSV download |
| GET | /api/export/inefficient-devices | CSV download |
| GET | /api/export/trend?months=6 | CSV download |
| GET | /api/export/alerts | CSV download |
| GET | /api/export/degradation | CSV download |