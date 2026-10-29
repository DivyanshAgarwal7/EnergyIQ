"""
Phase 3: Alert threshold management routes
- CRUD for device/building thresholds
- Threshold status view (current usage vs threshold)
- Run threshold check for a date
"""
from flask import Blueprint, jsonify, request
from db import execute_query, execute_write, call_procedure

thresholds_bp = Blueprint('thresholds', __name__)


@thresholds_bp.route('/api/thresholds', methods=['GET'])
def get_thresholds():
    """All active thresholds with device/building context."""
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT
                    at2.threshold_id, at2.threshold_kwh, at2.threshold_type, at2.is_active,
                    d.device_id, d.device_name, dt.type_name AS device_type,
                    b.building_id, b.building_name
                FROM alert_thresholds at2
                LEFT JOIN devices d      ON at2.device_id   = d.device_id
                LEFT JOIN device_types dt ON d.type_id      = dt.type_id
                LEFT JOIN buildings b    ON COALESCE(d.building_id, at2.building_id) = b.building_id
                WHERE COALESCE(d.building_id, at2.building_id) = %s
                ORDER BY at2.threshold_type, d.device_name
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT
                    at2.threshold_id, at2.threshold_kwh, at2.threshold_type, at2.is_active,
                    d.device_id, d.device_name, dt.type_name AS device_type,
                    b.building_id, b.building_name
                FROM alert_thresholds at2
                LEFT JOIN devices d      ON at2.device_id   = d.device_id
                LEFT JOIN device_types dt ON d.type_id      = dt.type_id
                LEFT JOIN buildings b    ON COALESCE(d.building_id, at2.building_id) = b.building_id
                ORDER BY b.building_name, at2.threshold_type
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@thresholds_bp.route('/api/thresholds/status', methods=['GET'])
def threshold_status():
    """Current usage vs threshold for all device-level thresholds."""
    try:
        rows = execute_query("""
            SELECT * FROM vw_threshold_status
            WHERE is_active = TRUE
            ORDER BY utilisation_pct DESC
        """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@thresholds_bp.route('/api/thresholds', methods=['POST'])
def create_threshold():
    """
    Create a threshold.
    Body: { device_id OR building_id, threshold_kwh, threshold_type }
    """
    data = request.get_json() or {}
    device_id   = data.get('device_id')
    building_id = data.get('building_id')
    kwh         = data.get('threshold_kwh')
    ttype       = data.get('threshold_type', 'DAILY_KWH')

    if not kwh or not (device_id or building_id):
        return jsonify({"error": "threshold_kwh and either device_id or building_id required"}), 400
    if device_id and building_id:
        return jsonify({"error": "Provide device_id OR building_id, not both"}), 400
    try:
        execute_write("""
            INSERT INTO alert_thresholds (device_id, building_id, threshold_kwh, threshold_type)
            VALUES (%s, %s, %s, %s)
        """, (device_id, building_id, kwh, ttype))
        return jsonify({"status": "created"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@thresholds_bp.route('/api/thresholds/<int:threshold_id>', methods=['PUT'])
def update_threshold(threshold_id):
    """Update threshold value or active status."""
    data = request.get_json() or {}
    try:
        if 'threshold_kwh' in data:
            execute_write(
                "UPDATE alert_thresholds SET threshold_kwh = %s WHERE threshold_id = %s",
                (data['threshold_kwh'], threshold_id)
            )
        if 'is_active' in data:
            execute_write(
                "UPDATE alert_thresholds SET is_active = %s WHERE threshold_id = %s",
                (bool(data['is_active']), threshold_id)
            )
        return jsonify({"status": "updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@thresholds_bp.route('/api/thresholds/check', methods=['POST'])
def check_thresholds():
    """
    Run sp_check_thresholds for a given date.
    Body: { "date": "YYYY-MM-DD" }
    """
    data = request.get_json() or {}
    date = data.get('date')
    if not date:
        return jsonify({"error": "date required"}), 400
    try:
        result = call_procedure('sp_check_thresholds', [date])
        return jsonify({"status": "done", "result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500