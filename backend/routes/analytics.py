from flask import Blueprint, jsonify, request
from db import execute_query, call_procedure

analytics_bp = Blueprint('analytics', __name__)


@analytics_bp.route('/api/analytics/building-monthly', methods=['GET'])
def building_monthly():
    """Building-level monthly consumption. Used by dashboard bar chart."""
    year  = request.args.get('year',  type=int)
    month = request.args.get('month', type=int)
    if not year or not month:
        return jsonify({"error": "year and month are required"}), 400
    try:
        rows = execute_query("""
            SELECT * FROM vw_building_monthly
            WHERE yr = %s AND mo = %s
            ORDER BY total_kwh DESC
        """, (year, month))
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/api/analytics/efficiency', methods=['GET'])
def device_efficiency():
    """Efficiency scores for all active devices."""
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT * FROM vw_device_efficiency
                WHERE building_id = %s
                ORDER BY efficiency_pct ASC
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT * FROM vw_device_efficiency
                ORDER BY efficiency_pct ASC
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/api/analytics/trend', methods=['GET'])
def daily_trend():
    """30-day daily trend per building. Used by trend line chart."""
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT * FROM vw_daily_trend_30d
                WHERE building_id = %s
                ORDER BY reading_date
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT reading_date, SUM(total_kwh) AS total_kwh
                FROM vw_daily_trend_30d
                GROUP BY reading_date
                ORDER BY reading_date
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/api/analytics/building-report', methods=['GET'])
def building_report():
    """Full device breakdown for a building in a month."""
    building_id = request.args.get('building_id', type=int)
    year        = request.args.get('year',        type=int)
    month       = request.args.get('month',       type=int)
    if not all([building_id, year, month]):
        return jsonify({"error": "building_id, year, month required"}), 400
    try:
        rows = call_procedure('sp_building_report', [building_id, year, month])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/api/analytics/detect-anomalies', methods=['POST'])
def detect_anomalies():
    """Trigger anomaly detection for a specific date."""
    data = request.get_json()
    date = data.get('date') if data else None
    if not date:
        return jsonify({"error": "date is required (YYYY-MM-DD)"}), 400
    try:
        result = call_procedure('sp_detect_anomalies', [date])
        return jsonify({"status": "done", "result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@analytics_bp.route('/api/analytics/summary', methods=['GET'])
def summary():
    """
    KPI summary for the dashboard header cards.
    Returns: total buildings, devices, this-month consumption,
             open alerts count, and overall avg efficiency.
    """
    try:
        from datetime import date
        today      = date.today()
        this_year  = today.year
        this_month = today.month

        kpis = execute_query("""
            SELECT
                (SELECT COUNT(*) FROM buildings) AS total_buildings,
                (SELECT COUNT(*) FROM devices WHERE is_active = TRUE) AS active_devices,
                (SELECT COUNT(*) FROM alerts WHERE is_resolved = FALSE) AS open_alerts,
                (SELECT ROUND(AVG(efficiency_pct), 1)
                 FROM vw_device_efficiency
                 WHERE efficiency_pct IS NOT NULL) AS avg_efficiency_pct,
                (SELECT ROUND(SUM(total_kwh), 1)
                 FROM vw_building_monthly
                 WHERE yr = %s AND mo = %s) AS this_month_kwh
        """, (this_year, this_month))

        return jsonify(kpis[0] if kpis else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500