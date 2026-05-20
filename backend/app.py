"""GPU Dev Container Admin — Flask application entry point."""

import os
import sys
import threading
import time as _time

from flask import Flask
from flask_cors import CORS
from loguru import logger
from dotenv import load_dotenv

# Load root .env for local dev; in Docker, vars are injected by compose
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logger.add("manager_backend.log", rotation="500 MB", retention="10 days", level="INFO")

from utils.config_validator import validate_config, ConfigValidationError
try:
    validate_config(strict=True)
except ConfigValidationError as e:
    logger.error(f"Configuration validation failed: {e}")
    sys.exit(1)

from database import UserDatabase, AgentRepository
from middleware.traffic_tracker import setup_traffic_tracking

app = Flask(__name__)
CORS(app)
setup_traffic_tracking(app)

db = UserDatabase()
db.initialize_database()


def _stale_agent_watchdog():
    repo = AgentRepository()
    while True:
        _time.sleep(60)
        try:
            repo.mark_stale_offline(threshold_seconds=90)
        except Exception as e:
            logger.error(f"Stale agent watchdog error: {e}")


threading.Thread(target=_stale_agent_watchdog, daemon=True, name="stale-agent-watchdog").start()

# Register all route blueprints
from api.auth_routes import auth_bp
from api.user_routes import user_bp
from api.server_routes import server_bp
from api.agent_routes import agent_bp
from api.user_service_routes import user_service_bp
from api.health_routes import health_bp
from api.container_routes import container_bp
from api.traffic_routes import traffic_bp
from api.registry_routes import registry_bp
from api.build_routes import build_bp
from api.upload_routes import upload_bp

for _bp in (auth_bp, user_bp, server_bp, agent_bp, user_service_bp,
            health_bp, container_bp, traffic_bp, registry_bp, build_bp, upload_bp):
    app.register_blueprint(_bp)

if __name__ == '__main__':
    port = int(os.getenv('MGMT_SERVER_PORT', os.getenv('BACKEND_PORT', '8500')))
    logger.info(f"Starting Flask application on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
