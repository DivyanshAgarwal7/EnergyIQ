"""
Phase 2: Trend analysis routes
- Month-over-month per building
- Rolling trend report (stored proc)
- Building efficiency score (function)
"""
from flask import Blueprint, jsonify, request
from db import execute_query, call_procedure

trend_bp = Blueprint('trend', __name__)


@trend_bp.route('/api/trend/mom', methods=['GET'])
def mom_trend():
    """Month-over-month consumption change per building."""
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT * FROM vw_mom_trend
                WHERE building_id = %s
                ORDER BY yr, mo
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT * FROM vw_mom_trend
                ORDER BY building_name, yr, mo
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@trend_bp.route('/api/trend/report', methods=['GET'])
def trend_report():
    """Full rolling trend report via stored procedure."""
    months = request.args.get('months', 6, type=int)
    try:
        rows = call_procedure('sp_trend_report', [months])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@trend_bp.route('/api/trend/building-score', methods=['GET'])
def building_score():
    """Overall efficiency score per building using fn_building_efficiency."""
    try:
        rows = execute_query("""
            SELECT
                b.building_id,
                b.building_name,
                bt.type_name           AS building_type,
                b.area_sqft,
                fn_building_efficiency(b.building_id) AS efficiency_score,
                fn_efficiency_label(
                    fn_building_efficiency(b.building_id)
                )                      AS efficiency_label,
                (SELECT COUNT(*) FROM devices d2
                 WHERE d2.building_id = b.building_id
                   AND d2.is_active = TRUE) AS active_devices
            FROM buildings b
            JOIN building_types bt ON b.type_id = bt.type_id
            ORDER BY efficiency_score ASC
        """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@trend_bp.route('/api/trend/daily-by-building', methods=['GET'])
def daily_by_building():
    """
    Daily consumption for each building for the last N days.
    Used to draw per-building trend lines on one chart.
    """
    days = request.args.get('days', 30, type=int)
    try:
        rows = execute_query("""
            SELECT
                e.reading_date,
                b.building_id,
                b.building_name,
                ROUND(SUM(e.energy_kwh), 2) AS total_kwh
            FROM energy_readings e
            JOIN devices d   ON e.device_id   = d.device_id
            JOIN buildings b ON d.building_id = b.building_id
            WHERE e.reading_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
            GROUP BY e.reading_date, b.building_id, b.building_name
            ORDER BY b.building_name, e.reading_date
        """, (days,))
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500