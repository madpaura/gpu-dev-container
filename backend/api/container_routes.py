"""Admin container management routes."""

from flask import Blueprint, request, jsonify
from loguru import logger

from services.container_service import ContainerService
from services.agent_service import AgentService
from utils.auth_helpers import require_session_auth

import os

container_bp = Blueprint('container', __name__)

agent_port = int(os.getenv('AGENT_PORT', '8510'))
_agent_service = AgentService(agent_port, 20)
_container_service = ContainerService(_agent_service)


def _server_id_to_ip(server_id: str) -> str:
    return server_id.replace('server-', '').replace('-', '.')


@container_bp.route('/api/admin/containers/<server_id>', methods=['GET'])
def get_containers(server_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code

    try:
        server_ip = _server_id_to_ip(server_id)
        search_term = request.args.get('search') or None

        logger.info(f"Getting containers from {server_ip} for user {session.get('username')}")
        result = _container_service.get_containers_from_server(server_ip, search_term)

        if result.success:
            return jsonify({
                'success': True,
                'server_id': result.server_id,
                'server_ip': result.server_ip,
                'containers': [
                    {
                        'id': c.id,
                        'name': c.name,
                        'image': c.image,
                        'status': c.status,
                        'state': c.state,
                        'created': c.created,
                        'started': c.started,
                        'finished': c.finished,
                        'uptime': c.uptime,
                        'cpu_usage': c.cpu_usage,
                        'memory_usage': c.memory_usage,
                        'memory_used_mb': c.memory_used_mb,
                        'memory_limit_mb': c.memory_limit_mb,
                        'disk_usage': c.disk_usage,
                        'network_rx_bytes': c.network_rx_bytes,
                        'network_tx_bytes': c.network_tx_bytes,
                        'ports': c.ports,
                        'volumes': c.volumes,
                        'environment': c.environment,
                        'command': c.command,
                        'labels': c.labels,
                        'restart_count': c.restart_count,
                        'platform': c.platform,
                    }
                    for c in result.containers
                ],
                'total_count': result.total_count,
                'running_count': result.running_count,
                'stopped_count': result.stopped_count,
            })
        return jsonify({
            'success': False,
            'error': result.error,
            'server_id': result.server_id,
            'server_ip': result.server_ip,
            'containers': [],
            'total_count': 0,
            'running_count': 0,
            'stopped_count': 0,
        }), 200  # agent offline is not a server error

    except Exception as e:
        logger.error(f"Error in get_containers: {e}")
        return jsonify({'success': False, 'error': str(e), 'containers': []}), 500


@container_bp.route('/api/admin/containers/<server_id>/<container_id>/action', methods=['POST'])
def container_action(server_id, container_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code

    try:
        data = request.get_json() or {}
        action = data.get('action')
        force = data.get('force', False)

        if not action:
            return jsonify({'success': False, 'error': 'Action is required'}), 400
        if action not in ('start', 'stop', 'restart', 'delete'):
            return jsonify({'success': False, 'error': f'Invalid action: {action}'}), 400

        server_ip = _server_id_to_ip(server_id)
        logger.info(f"User {session.get('username')} performing {action} on {container_id} at {server_ip}")

        result = _container_service.perform_container_action(server_ip, container_id, action, force)

        if result.success:
            return jsonify({
                'success': True,
                'action': result.action,
                'container_id': result.container_id,
                'container_name': result.container_name,
                'message': result.message,
                'new_status': result.new_status,
            })
        return jsonify({
            'success': False,
            'action': result.action,
            'container_id': result.container_id,
            'message': result.message,
            'error': result.error,
        }), 400

    except Exception as e:
        logger.error(f"Error in container_action: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@container_bp.route('/api/admin/containers/cache/clear', methods=['POST'])
def clear_container_cache():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code

    try:
        _container_service.clear_cache()
        logger.info(f"Container cache cleared by {session.get('username')}")
        return jsonify({'success': True, 'message': 'Container cache cleared successfully'})
    except Exception as e:
        logger.error(f"Error clearing container cache: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
