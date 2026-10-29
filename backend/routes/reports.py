"""
Phase 3: Scheduled Reports Service
- CRUD for report schedules
- Manual trigger: run a scheduled report now
- Report run history
- The scheduler itself (lightweight — no Celery needed for Phase 3)

Architecture note:
  A production system would use Celery + Redis or APScheduler.
  Phase 3 uses a simple in-process APScheduler that starts when Flask
  starts. For interviews, this is the right answer: explain it, then
  say "in production we'd move this to a dedicated worker."
"""
import os
import csv
import io
from datetime import datetime, date
from flask import Blueprint, jsonify, request, Response
from db import execute_query, execute_write, call_procedure

reports_bp = Blueprint('reports', __name__)

# ---- Export directory (relative to backend/) ----
EXPORT_DIR = os.path.join(os.path.dirname(__file__), '..', 'exports')
os.makedirs(EXPORT_DIR, exist_ok=True)


# ============================================================
# Schedule CRUD
# ============================================================

@reports_bp.route('/api/reports/schedules', methods=['GET'])
def get_schedules():
    """All scheduled reports with last run status."""
    try:
        rows = execute_query("SELECT * FROM vw_schedule_status")
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@reports_bp.route('/api/reports/schedules', methods=['POST'])
def create_schedule():
    """
    Create a new scheduled report.
    Body: { report_name, report_type, frequency, building_id?, export_format }
    """
    data = request.get_json() or {}
    required = ['report_name', 'report_type', 'frequency']
    if not all(k in data for k in required):
        return jsonify({"error": f"Required: {required}"}), 400
    try:
        execute_write("""
            INSERT INTO scheduled_reports
                (report_name, report_type, frequency, building_id, export_format, next_run_at)
            VALUES (%s, %s, %s, %s, %s,
                CASE %s
                    WHEN 'DAILY'   THEN DATE_ADD(NOW(), INTERVAL 1 DAY)
                    WHEN 'WEEKLY'  THEN DATE_ADD(NOW(), INTERVAL 7 DAY)
                    WHEN 'MONTHLY' THEN DATE_ADD(NOW(), INTERVAL 1 MONTH)
                END
            )
        """, (
            data['report_name'],
            data['report_type'],
            data['frequency'],
            data.get('building_id'),
            data.get('export_format', 'CSV'),
            data['frequency']
        ))
        return jsonify({"status": "created"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@reports_bp.route('/api/reports/schedules/<int:schedule_id>/toggle', methods=['POST'])
def toggle_schedule(schedule_id):
    """Enable / disable a schedule."""
    try:
        execute_write("""
            UPDATE scheduled_reports
            SET is_active = NOT is_active
            WHERE schedule_id = %s
        """, (schedule_id,))
        return jsonify({"status": "toggled"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@reports_bp.route('/api/reports/schedules/<int:schedule_id>', methods=['DELETE'])
def delete_schedule(schedule_id):
    try:
        execute_write(
            "DELETE FROM scheduled_reports WHERE schedule_id = %s",
            (schedule_id,)
        )
        return jsonify({"status": "deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# Manual report execution
# ============================================================

@reports_bp.route('/api/reports/run/<int:schedule_id>', methods=['GET', 'POST'])
def run_report(schedule_id):
    """
    Manually trigger a scheduled report and return CSV.
    Also logs the run via sp_log_report_run.
    """
    try:
        schedules = execute_query(
            "SELECT * FROM scheduled_reports WHERE schedule_id = %s",
            (schedule_id,)
        )
        if not schedules:
            return jsonify({"error": "Schedule not found"}), 404

        sched     = schedules[0]
        rows, filename = _generate_report_data(sched)
        rows_count = len(rows)

        # Log the run
        call_procedure('sp_log_report_run', [
            schedule_id, 'SUCCESS', rows_count, filename, None
        ])

        if not rows:
            return jsonify({"error": "No data to export"}), 404

        # Return CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        for row in rows:
            writer.writerow({k: str(v) if v is not None else '' for k, v in row.items()})

        csv_bytes = output.getvalue().encode('utf-8')
        response = Response(
            csv_bytes,
            mimetype='text/csv'
        )
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.headers['Content-Length']       = len(csv_bytes)
        response.headers['Access-Control-Allow-Origin']  = '*'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
        return response

    except Exception as e:
        # Log failed run
        try:
            call_procedure('sp_log_report_run', [schedule_id, 'FAILED', 0, None, str(e)])
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


def _generate_report_data(sched: dict):
    """Generate report rows based on report_type. Returns (rows, filename)."""
    rtype       = sched['report_type']
    building_id = sched.get('building_id')
    today       = date.today()
    ts          = today.strftime('%Y%m%d')

    if rtype == 'BUILDING_MONTHLY':
        rows = execute_query("""
            SELECT building_name, building_type, yr AS year, mo AS month,
                   total_kwh, kwh_per_sqft, active_devices
            FROM vw_building_monthly
            WHERE yr = %s AND mo = %s
            ORDER BY total_kwh DESC
        """, (today.year, today.month))
        filename = f'building_monthly_{ts}.csv'

    elif rtype == 'EFFICIENCY':
        if building_id:
            rows = execute_query("""
                SELECT device_name, device_type, building_name,
                       actual_kwh, expected_kwh, efficiency_pct, efficiency_status
                FROM vw_device_efficiency WHERE building_id = %s
                ORDER BY efficiency_pct ASC
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT device_name, device_type, building_name,
                       actual_kwh, expected_kwh, efficiency_pct, efficiency_status
                FROM vw_device_efficiency ORDER BY efficiency_pct ASC
            """)
        filename = f'efficiency_{ts}.csv'

    elif rtype == 'TREND':
        rows = call_procedure('sp_trend_report', [6])
        filename = f'trend_6months_{ts}.csv'

    elif rtype == 'ANOMALY':
        rows = execute_query("""
            SELECT alert_type, device_name, building_name,
                   message, created_at
            FROM vw_alerts_detail
            WHERE is_resolved = FALSE
            ORDER BY created_at DESC
        """)
        filename = f'anomalies_{ts}.csv'

    elif rtype == 'FORECAST':
        rows = execute_query("""
            SELECT device_name, device_type, building_name,
                   forecast_label, ma_predicted_kwh, trend_predicted_kwh,
                   seasonal_predicted_kwh, ensemble_predicted_kwh,
                   ma_confidence
            FROM vw_forecast_summary
            WHERE forecast_month = (SELECT MAX(forecast_month) FROM forecast_log)
            ORDER BY building_name, device_name
        """)
        filename = f'forecast_{ts}.csv'

    else:
        rows, filename = [], f'report_{ts}.csv'

    return rows, filename


# ============================================================
# Run history
# ============================================================

@reports_bp.route('/api/reports/history', methods=['GET'])
def run_history():
    """Last 50 report run log entries."""
    schedule_id = request.args.get('schedule_id', type=int)
    try:
        if schedule_id:
            rows = execute_query("""
                SELECT r.*, s.report_name, s.report_type
                FROM report_run_log r
                JOIN scheduled_reports s ON r.schedule_id = s.schedule_id
                WHERE r.schedule_id = %s
                ORDER BY r.run_at DESC LIMIT 50
            """, (schedule_id,))
        else:
            rows = execute_query("""
                SELECT r.*, s.report_name, s.report_type
                FROM report_run_log r
                JOIN scheduled_reports s ON r.schedule_id = s.schedule_id
                ORDER BY r.run_at DESC LIMIT 50
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500