from flask import Blueprint, jsonify, request
from db import execute_query, call_procedure

alerts_bp = Blueprint('alerts', __name__)


@alerts_bp.route('/api/alerts', methods=['GET'])
def get_alerts():
    resolved = request.args.get('resolved', 'false').lower() == 'true'
    try:
        rows = execute_query("""
            SELECT * FROM vw_alerts_detail
            WHERE is_resolved = %s
            ORDER BY created_at DESC
            LIMIT 100
        """, (resolved,))
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@alerts_bp.route('/api/alerts/<int:alert_id>/resolve', methods=['POST'])
def resolve_alert(alert_id):
    try:
        result = call_procedure('sp_resolve_alert', [alert_id])
        return jsonify({"status": "resolved", "alert": result})
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 400