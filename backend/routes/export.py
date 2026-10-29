"""
Phase 2: Export service — CSV report generation
All export endpoints return downloadable CSV files.
"""
import csv
import io
from datetime import date
from flask import Blueprint, Response, request, jsonify
from db import execute_query, call_procedure

export_bp = Blueprint('export', __name__)


def make_csv_response(rows: list, filename: str) -> Response:
    """Convert a list of dicts to a downloadable CSV response."""
    if not rows:
        return jsonify({"error": "No data to export"}), 404

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    for row in rows:
        # Convert date/datetime objects to strings for CSV
        clean = {k: str(v) if v is not None else '' for k, v in row.items()}
        writer.writerow(clean)

    csv_bytes = output.getvalue().encode('utf-8')
    return Response(
        csv_bytes,
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Length': len(csv_bytes)
        }
    )


@export_bp.route('/api/export/building-monthly', methods=['GET'])
def export_building_monthly():
    """Export building monthly consumption as CSV."""
    year  = request.args.get('year',  type=int) or date.today().year
    month = request.args.get('month', type=int) or date.today().month
    try:
        rows = execute_query("""
            SELECT
                building_name, building_type, yr AS year, mo AS month,
                total_kwh, kwh_per_sqft, active_devices
            FROM vw_building_monthly
            WHERE yr = %s AND mo = %s
            ORDER BY total_kwh DESC
        """, (year, month))
        return make_csv_response(rows, f'building_consumption_{year}_{month:02d}.csv')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@export_bp.route('/api/export/efficiency', methods=['GET'])
def export_efficiency():
    """Export full device efficiency report as CSV."""
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT device_name, device_type, building_name,
                       actual_kwh, expected_kwh, efficiency_pct,
                       efficiency_status, days_measured
                FROM vw_device_efficiency
                WHERE building_id = %s
                ORDER BY efficiency_pct ASC
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT device_name, device_type, building_name,
                       actual_kwh, expected_kwh, efficiency_pct,
                       efficiency_status, days_measured
                FROM vw_device_efficiency
                ORDER BY efficiency_pct ASC
            """)
        return make_csv_response(rows, 'device_efficiency_report.csv')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@export_bp.route('/api/export/inefficient-devices', methods=['GET'])
def export_inefficient():
    """Export list of inefficient devices + wasted kWh."""
    try:
        rows = execute_query("""
            SELECT device_name, device_type, building_name,
                   actual_kwh, expected_kwh, efficiency_pct,
                   wasted_kwh, days_measured
            FROM vw_inefficient_devices
            ORDER BY efficiency_pct ASC
        """)
        return make_csv_response(rows, 'inefficient_devices.csv')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@export_bp.route('/api/export/trend', methods=['GET'])
def export_trend():
    """Export rolling trend report as CSV."""
    months = request.args.get('months', 6, type=int)
    try:
        rows = call_procedure('sp_trend_report', [months])
        return make_csv_response(rows, f'trend_report_{months}months.csv')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@export_bp.route('/api/export/alerts', methods=['GET'])
def export_alerts():
    """Export all alerts (open + resolved) as CSV."""
    try:
        rows = execute_query("""
            SELECT alert_type, device_name, building_name,
                   message, is_resolved, created_at, resolved_at
            FROM vw_alerts_detail
            ORDER BY created_at DESC
        """)
        return make_csv_response(rows, 'alerts_export.csv')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@export_bp.route('/api/export/degradation', methods=['GET'])
def export_degradation():
    """Export device degradation report as CSV."""
    try:
        rows = call_procedure('sp_degradation_report', [1.15])
        return make_csv_response(rows, 'degradation_report.csv')
    except Exception as e:
        return jsonify({"error": str(e)}), 500