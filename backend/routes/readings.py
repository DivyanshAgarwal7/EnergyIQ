from flask import Blueprint, jsonify, request
from db import execute_query, call_procedure

readings_bp = Blueprint('readings', __name__)


@readings_bp.route('/api/readings', methods=['GET'])
def get_readings():
    device_id = request.args.get('device_id', type=int)
    start     = request.args.get('start')
    end       = request.args.get('end')

    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    try:
        rows = execute_query("""
            SELECT reading_id, device_id, reading_date, energy_kwh, recorded_at
            FROM energy_readings
            WHERE device_id    = %s
              AND reading_date BETWEEN %s AND %s
            ORDER BY reading_date DESC
        """, (device_id, start or '2000-01-01', end or '2099-12-31'))
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@readings_bp.route('/api/readings', methods=['POST'])
def add_reading():
    data = request.get_json()
    required = ['device_id', 'reading_date', 'energy_kwh']
    if not all(k in data for k in required):
        return jsonify({"error": f"Required fields: {required}"}), 400
    try:
        # Use the validated stored procedure
        result = call_procedure('sp_insert_reading', [
            data['device_id'],
            data['reading_date'],
            data['energy_kwh']
        ])
        return jsonify({"status": "inserted", "detail": result}), 201
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400