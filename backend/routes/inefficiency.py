"""
Phase 2: Inefficiency detection routes
- Inefficient devices list (below 80% threshold)
- Weekend vs weekday anomalies
- Device degradation detection
- Weekend anomaly sweep (stored proc)
"""
from flask import Blueprint, jsonify, request
from db import execute_query, call_procedure

inefficiency_bp = Blueprint('inefficiency', __name__)


@inefficiency_bp.route('/api/inefficiency/devices', methods=['GET'])
def inefficient_devices():
    """All devices below 80% efficiency threshold."""
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT * FROM vw_inefficient_devices
                WHERE building_id = %s
                ORDER BY efficiency_pct ASC
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT * FROM vw_inefficient_devices
                ORDER BY efficiency_pct ASC
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@inefficiency_bp.route('/api/inefficiency/weekend', methods=['GET'])
def weekend_anomalies():
    """Weekend vs weekday consumption ratio per device type per building."""
    try:
        rows = execute_query("""
            SELECT * FROM vw_weekend_vs_weekday
            ORDER BY weekend_as_pct_of_weekday DESC
        """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@inefficiency_bp.route('/api/inefficiency/degradation', methods=['GET'])
def degradation():
    """Devices showing consumption increase vs their 30-60 day baseline."""
    min_ratio = request.args.get('min_ratio', 1.15, type=float)
    try:
        rows = call_procedure('sp_degradation_report', [min_ratio])
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@inefficiency_bp.route('/api/inefficiency/weekend-sweep', methods=['POST'])
def weekend_sweep():
    """Run weekend anomaly sweep and log alerts."""
    data      = request.get_json() or {}
    threshold = data.get('threshold_pct', 70)
    try:
        result = call_procedure('sp_weekend_anomaly_sweep', [threshold])
        return jsonify({"status": "done", "result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@inefficiency_bp.route('/api/inefficiency/efficiency-ranking', methods=['GET'])
def efficiency_ranking():
    """
    Full efficiency ranking — worst to best (or best to worst).
    order=asc (worst first, default) or order=desc (best first)
    """
    order = request.args.get('order', 'asc').upper()
    limit = request.args.get('limit', 20, type=int)
    try:
        rows = call_procedure('sp_efficiency_ranking', [order, limit])
        # Sort in Python since MySQL proc returns ASC always
        reverse = (order == 'DESC')
        rows.sort(key=lambda r: r.get('efficiency_pct') or 0, reverse=reverse)
        return jsonify(rows[:limit])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@inefficiency_bp.route('/api/inefficiency/summary', methods=['GET'])
def inefficiency_summary():
    """
    Summary KPIs for the inefficiency page header cards.
    - Count of inefficient devices
    - Total wasted kWh
    - Worst performing building
    - Devices with degradation
    """
    try:
        rows = execute_query("""
            SELECT
                (SELECT COUNT(*) FROM vw_inefficient_devices)
                    AS inefficient_device_count,
                (SELECT ROUND(SUM(wasted_kwh), 1) FROM vw_inefficient_devices)
                    AS total_wasted_kwh,
                (SELECT building_name FROM vw_inefficient_devices
                 GROUP BY building_id, building_name
                 ORDER BY SUM(wasted_kwh) DESC LIMIT 1)
                    AS worst_building,
                (SELECT COUNT(*) FROM vw_device_degradation)
                    AS degrading_device_count
        """)
        return jsonify(rows[0] if rows else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500