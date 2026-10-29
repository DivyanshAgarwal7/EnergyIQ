from flask import Blueprint, jsonify, request
from db import execute_query, execute_write

buildings_bp = Blueprint('buildings', __name__)


@buildings_bp.route('/api/buildings', methods=['GET'])
def get_buildings():
    try:
        rows = execute_query("""
            SELECT b.building_id, b.building_name, bt.type_name AS building_type,
                   b.area_sqft, b.location, b.created_at
            FROM buildings b
            JOIN building_types bt ON b.type_id = bt.type_id
            ORDER BY b.building_name
        """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@buildings_bp.route('/api/buildings/<int:building_id>', methods=['GET'])
def get_building(building_id):
    try:
        rows = execute_query("""
            SELECT b.building_id, b.building_name, bt.type_name AS building_type,
                   b.area_sqft, b.location, b.created_at
            FROM buildings b
            JOIN building_types bt ON b.type_id = bt.type_id
            WHERE b.building_id = %s
        """, (building_id,))
        if not rows:
            return jsonify({"error": "Building not found"}), 404
        return jsonify(rows[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@buildings_bp.route('/api/buildings', methods=['POST'])
def add_building():
    data = request.get_json()
    required = ['building_name', 'type_id', 'area_sqft']
    if not all(k in data for k in required):
        return jsonify({"error": f"Required fields: {required}"}), 400
    try:
        execute_write("""
            INSERT INTO buildings (building_name, type_id, area_sqft, location)
            VALUES (%s, %s, %s, %s)
        """, (data['building_name'], data['type_id'],
              data['area_sqft'], data.get('location', '')))
        return jsonify({"status": "created"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500