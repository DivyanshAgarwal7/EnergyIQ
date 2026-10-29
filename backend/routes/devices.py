from flask import Blueprint, jsonify, request
from db import execute_query, execute_write

devices_bp = Blueprint('devices', __name__)


@devices_bp.route('/api/devices', methods=['GET'])
def get_devices():
    building_id = request.args.get('building_id', type=int)
    try:
        if building_id:
            rows = execute_query("""
                SELECT d.device_id, d.device_name, dt.type_name AS device_type,
                       d.rated_power_kw, d.installed_on, d.is_active,
                       b.building_name
                FROM devices d
                JOIN device_types dt ON d.type_id    = dt.type_id
                JOIN buildings b     ON d.building_id = b.building_id
                WHERE d.building_id = %s
                ORDER BY d.device_name
            """, (building_id,))
        else:
            rows = execute_query("""
                SELECT d.device_id, d.device_name, dt.type_name AS device_type,
                       d.rated_power_kw, d.installed_on, d.is_active,
                       b.building_name, b.building_id
                FROM devices d
                JOIN device_types dt ON d.type_id    = dt.type_id
                JOIN buildings b     ON d.building_id = b.building_id
                ORDER BY b.building_name, d.device_name
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@devices_bp.route('/api/device-types', methods=['GET'])
def get_device_types():
    try:
        rows = execute_query("SELECT * FROM device_types ORDER BY type_name")
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500