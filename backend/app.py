"""
Energy Analytics System — Flask Application Entry Point
Phase 3: Forecast, Thresholds, Scheduled Reports added
"""
from flask import Flask
from flask_cors import CORS

from routes.buildings    import buildings_bp
from routes.devices      import devices_bp
from routes.readings     import readings_bp
from routes.analytics    import analytics_bp
from routes.alerts       import alerts_bp
from routes.trend        import trend_bp
from routes.inefficiency import inefficiency_bp
from routes.export       import export_bp
from routes.forecast     import forecast_bp      # Phase 3
from routes.thresholds   import thresholds_bp    # Phase 3
from routes.reports      import reports_bp       # Phase 3

def create_app():
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(buildings_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(readings_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(trend_bp)
    app.register_blueprint(inefficiency_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(forecast_bp)       # Phase 3
    app.register_blueprint(thresholds_bp)     # Phase 3
    app.register_blueprint(reports_bp)        # Phase 3

    @app.route('/api/health', methods=['GET'])
    def health():
        return {"status": "ok", "message": "Energy Analytics API running", "phase": "3"}

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)