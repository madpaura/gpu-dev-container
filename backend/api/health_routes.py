"""Health check endpoint."""

from datetime import datetime
from flask import Blueprint, jsonify

from database import UserDatabase
from services.auth_service import AuthService
from services.user_service import UserService
from services.server_service import ServerService
from services.agent_service import AgentService
import os

health_bp = Blueprint('health', __name__)

_db = UserDatabase()
_agent_port = int(os.getenv('AGENT_PORT', '8510'))
_agent_service = AgentService(_agent_port, 20)
_auth_service = AuthService(_db)
_nginx_config = os.getenv('NGINX_CONFIG_FILE', 'backend/nginx/sites-available/dev-services')
_user_service = UserService(_db, _nginx_config, _agent_port)
_server_service = ServerService(_db, _agent_service, _agent_port)


@health_bp.route('/health', methods=['GET'])
def health_check():
    try:
        db_status = 'healthy'
        try:
            _db.get_user_by_id(1)
        except Exception as e:
            db_status = f'unhealthy: {e}'

        services_status = {
            'auth_service': 'healthy' if _auth_service else 'unhealthy',
            'user_service': 'healthy' if _user_service else 'unhealthy',
            'server_service': 'healthy' if _server_service else 'unhealthy',
            'agent_service': 'healthy' if _agent_service else 'unhealthy',
        }
        overall = 'healthy' if db_status == 'healthy' and all(
            v == 'healthy' for v in services_status.values()
        ) else 'unhealthy'

        return jsonify({
            'status': overall,
            'timestamp': datetime.now().isoformat(),
            'version': '1.0.0',
            'database': db_status,
            'services': services_status,
            'uptime': 'running',
        }), 200 if overall == 'healthy' else 503

    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
        }), 503
