"""
Phase 3: Forecast routes
- Generate forecasts for all devices (calls sp_generate_forecasts)
- Retrieve forecast summaries and building rollups
- Update forecast accuracy after month ends
- Forecast vs actual comparison
"""
from flask import Blueprint, jsonify, request
from db import execute_query, call_procedure

forecast_bp = Blueprint('forecast', __name__)


@forecast_bp.route('/api/forecast/generate', methods=['POST'])
def generate_forecasts():
    """
    Run sp_generate_forecasts — computes next month predictions.
    Uses a dedicated long-lived connection with extended timeout
    because this procedure calls multiple sub-functions per device.
    """
    import mysql.connector
    from config import DB_CONFIG

    conn   = None
    cursor = None
    try:
        # Use a direct connection with longer timeout — NOT the pool
        # sp_generate_forecasts can take 10-30s on large datasets
        conn = mysql.connector.connect(
            **DB_CONFIG,
            connection_timeout=120
        )
        conn.autocommit = False
        cursor = conn.cursor(dictionary=True)

        cursor.callproc('sp_generate_forecasts', [])

        results = []
        for rs in cursor.stored_results():
            results.extend(rs.fetchall())

        conn.commit()
        return jsonify({"status": "generated", "detail": results})

    except Exception as e:
        if conn:
            try: conn.rollback()
            except: pass
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()


@forecast_bp.route('/api/forecast/summary', methods=['GET'])
def forecast_summary():
    """All device-level forecasts for a given month."""
    month = request.args.get('month')   # format: YYYY-MM-01
    building_id = request.args.get('building_id', type=int)
    try:
        if month and building_id:
            rows = execute_query("""
                SELECT * FROM vw_forecast_summary
                WHERE forecast_month = %s AND building_id = %s
                ORDER BY building_name, device_name
            """, (month, building_id))
        elif month:
            rows = execute_query("""
                SELECT * FROM vw_forecast_summary
                WHERE forecast_month = %s
                ORDER BY building_name, device_name
            """, (month,))
        else:
            # Default: latest available forecast month
            rows = execute_query("""
                SELECT * FROM vw_forecast_summary
                WHERE forecast_month = (
                    SELECT MAX(forecast_month) FROM forecast_log
                )
                ORDER BY building_name, device_name
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@forecast_bp.route('/api/forecast/building', methods=['GET'])
def building_forecast():
    """Building-level forecast rollup."""
    try:
        rows = execute_query("""
            SELECT * FROM vw_building_forecast
            ORDER BY forecast_month, building_name
        """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@forecast_bp.route('/api/forecast/accuracy', methods=['GET'])
def forecast_accuracy():
    """Past forecast accuracy — only available after month has ended."""
    method = request.args.get('method')
    try:
        if method:
            rows = execute_query("""
                SELECT * FROM vw_forecast_accuracy
                WHERE method = %s
                ORDER BY raw_month DESC, error_pct ASC
            """, (method,))
        else:
            rows = execute_query("""
                SELECT * FROM vw_forecast_accuracy
                ORDER BY raw_month DESC, error_pct ASC
            """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@forecast_bp.route('/api/forecast/update-accuracy', methods=['POST'])
def update_accuracy():
    """
    Update actual vs predicted for a completed month.
    Body: { "forecast_month": "2024-03-01" }
    """
    data  = request.get_json() or {}
    month = data.get('forecast_month')
    if not month:
        return jsonify({"error": "forecast_month required (YYYY-MM-01)"}), 400
    try:
        result = call_procedure('sp_update_forecast_accuracy', [month])
        return jsonify({"status": "updated", "detail": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@forecast_bp.route('/api/forecast/months', methods=['GET'])
def available_months():
    """List all months that have forecast data."""
    try:
        rows = execute_query("""
            SELECT DISTINCT
                forecast_month,
                DATE_FORMAT(forecast_month, '%b %Y') AS label
            FROM forecast_log
            ORDER BY forecast_month DESC
        """)
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@forecast_bp.route('/api/forecast/kpis', methods=['GET'])
def forecast_kpis():
    """
    Summary KPIs for forecast page header:
    - Next month predicted total kWh
    - Number of devices forecasted
    - Avg confidence score
    - Number of forecasts generated
    """
    try:
        rows = execute_query("""
            SELECT
                DATE_FORMAT(
                    DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH),
                    '%b %Y'
                )                              AS next_month_label,
                (SELECT COUNT(DISTINCT device_id)
                 FROM forecast_log
                 WHERE forecast_month = DATE_FORMAT(
                     DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH),
                     '%Y-%m-01'))              AS devices_forecasted,
                (SELECT ROUND(SUM(ensemble_predicted_kwh), 1)
                 FROM vw_building_forecast
                 WHERE forecast_month = DATE_FORMAT(
                     DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH),
                     '%Y-%m-01'))              AS next_month_total_kwh,
                (SELECT ROUND(AVG(ma_confidence), 1)
                 FROM vw_forecast_summary
                 WHERE forecast_month = DATE_FORMAT(
                     DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH),
                     '%Y-%m-01'))              AS avg_confidence_pct,
                (SELECT ROUND(AVG(error_pct), 1)
                 FROM vw_forecast_accuracy)    AS historical_avg_error_pct
        """)
        return jsonify(rows[0] if rows else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500