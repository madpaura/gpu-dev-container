"""Server, SSH, Docker image, and audit log routes."""

import os
from flask import Blueprint, request, jsonify
from loguru import logger

from database import UserDatabase
from services.server_service import ServerService
from services.ssh_service import SSHService
from services.docker_service import DockerService
from services.audit_service import AuditService
from services.agent_service import AgentService
from utils.helpers import get_client_ip
from utils.auth_helpers import (
    require_admin_auth, require_permission_auth,
    require_session_auth, require_session_auth_docker,
    require_admin_auth_with_db,
)

server_bp = Blueprint('server', __name__)

_db = UserDatabase()
_agent_port = int(os.getenv('AGENT_PORT', '8510'))
_agent_service = AgentService(_agent_port, 20)
_server_service = ServerService(_db, _agent_service, _agent_port)
_ssh_service = SSHService(_db)
_docker_service = DockerService(_db, _agent_service, _agent_port)
_audit_service = AuditService(_db)


# ── Server resources ────────────────────────────────────────────────────────

@server_bp.route('/api/server-resources', methods=['GET'])
def get_server_resources():
    servers = _server_service.get_server_resources()
    if servers:
        return jsonify({'success': True, 'servers': servers})
    return jsonify({'success': False, 'error': 'No servers available'}), 404


@server_bp.route('/api/admin/servers', methods=['GET'])
def get_admin_servers():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    try:
        return jsonify({'success': True, 'servers': _server_service.get_admin_servers()})
    except Exception as e:
        logger.error(f"Error fetching server data: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch server data'}), 500


@server_bp.route('/api/admin/servers/stats', methods=['GET'])
def get_server_stats():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    try:
        return jsonify({'success': True, 'stats': _server_service.get_server_stats()})
    except Exception as e:
        logger.error(f"Error fetching server stats: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch server stats'}), 500


@server_bp.route('/api/admin/servers/<server_id>/action', methods=['POST'])
def server_action(server_id):
    data = request.get_json()
    action = data.get('action')
    if not action:
        return jsonify({'success': False, 'error': 'Action required'}), 400

    if action == 'delete':
        session, error_response, status_code = require_permission_auth('delete_server')
    elif action in ('remove_containers', 'cleanup_disk'):
        session, error_response, status_code = require_permission_auth('cleanup_server')
    else:
        session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code

    result = _server_service.perform_server_action(
        server_id, action, session.get('username', 'admin'), get_client_ip(request)
    )
    if result['success']:
        return jsonify(result)
    return jsonify(result), 500


@server_bp.route('/api/admin/servers', methods=['POST'])
def add_server():
    session, error_response, status_code = require_permission_auth('add_server')
    if error_response:
        return error_response, status_code
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Request data required'}), 400
    result = _server_service.add_server(data, session.get('username', 'admin'), get_client_ip(request))
    if result['success']:
        return jsonify(result)
    return jsonify(result), 400


@server_bp.route('/api/admin/servers/list', methods=['GET'])
def get_servers_list():
    session, error_response, status_code = require_session_auth_docker()
    if error_response:
        return error_response, status_code
    try:
        return jsonify({'servers': _server_service.get_servers_list()})
    except Exception as e:
        logger.error(f"Error getting servers list: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@server_bp.route('/api/admin/servers/for-users', methods=['GET'])
def get_servers_for_users():
    session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code
    try:
        return jsonify({'success': True, 'servers': _server_service.get_servers_for_user_management()})
    except Exception as e:
        logger.error(f"Error getting servers for user management: {e}")
        return jsonify({'success': False, 'error': 'Internal server error'}), 500


# ── SSH endpoints ───────────────────────────────────────────────────────────

@server_bp.route('/api/admin/servers/<server_id>/ssh/connect', methods=['POST'])
def ssh_connect(server_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    data = request.get_json()
    result = _ssh_service.create_ssh_connection(
        server_id, data.get('ssh_config', {}),
        _ssh_service.db and '', get_client_ip(request)
    )
    if result['success']:
        return jsonify(result)
    return jsonify(result), 500


@server_bp.route('/api/admin/servers/ssh/<session_id>/execute', methods=['POST'])
def ssh_execute(session_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    data = request.get_json()
    result = _ssh_service.execute_ssh_command(
        session_id, data.get('command', ''), '', get_client_ip(request)
    )
    if result['success']:
        return jsonify(result)
    return jsonify(result), 500


@server_bp.route('/api/admin/servers/ssh/<session_id>/output', methods=['GET'])
def ssh_get_output(session_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    result = _ssh_service.get_ssh_output(session_id)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 404


@server_bp.route('/api/admin/servers/ssh/<session_id>/status', methods=['GET'])
def ssh_status(session_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    result = _ssh_service.get_ssh_session_status(session_id)
    if result['success']:
        return jsonify(result)
    return jsonify(result), 500


@server_bp.route('/api/admin/servers/ssh/<session_id>/disconnect', methods=['POST'])
def ssh_disconnect(session_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    result = _ssh_service.disconnect_ssh_session(session_id, '', get_client_ip(request))
    if result['success']:
        return jsonify(result)
    return jsonify(result), 404


# ── Docker image endpoints ──────────────────────────────────────────────────

@server_bp.route('/api/admin/docker-images', methods=['GET'])
def get_docker_images():
    session, error_response, status_code = require_session_auth_docker()
    if error_response:
        return error_response, status_code
    return jsonify(_docker_service.get_docker_images(request.args.get('server_id')))


@server_bp.route('/api/admin/docker-images/<server_id>/<image_id>/details', methods=['GET'])
def get_docker_image_details(server_id, image_id):
    session, error_response, status_code = require_session_auth_docker()
    if error_response:
        return error_response, status_code
    result = _docker_service.get_docker_image_details(server_id, image_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


@server_bp.route('/api/admin/docker-images/<server_id>/<image_id>', methods=['DELETE'])
def delete_docker_image(server_id, image_id):
    session, error_response, status_code = require_session_auth_docker()
    if error_response:
        return error_response, status_code
    data = request.get_json() or {}
    result = _docker_service.delete_docker_image(server_id, image_id, data.get('force', False))
    if result.get('success'):
        return jsonify(result)
    return jsonify(result), 400


# ── Audit log endpoints ─────────────────────────────────────────────────────

@server_bp.route('/api/audit-logs', methods=['GET'])
def get_audit_logs():
    try:
        return jsonify({'success': True, 'logs': _audit_service.get_audit_logs()})
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch logs'}), 500


@server_bp.route('/api/audit-logs', methods=['DELETE'])
def clear_audit_logs():
    try:
        user_info, error_response, status_code = require_admin_auth_with_db()
        if error_response:
            return error_response, status_code
        success = _audit_service.clear_audit_logs(user_info.get('username', 'admin'), get_client_ip(request))
        if success:
            return jsonify({'success': True, 'message': 'All audit logs cleared successfully'})
        return jsonify({'success': False, 'error': 'Failed to clear logs'}), 500
    except Exception as e:
        logger.error(f"Error clearing audit logs: {e}")
        return jsonify({'success': False, 'error': 'Failed to clear logs'}), 500


# ── Cleanup endpoints ───────────────────────────────────────────────────────

@server_bp.route('/api/admin/servers/<server_id>/cleanup/summary', methods=['POST'])
def get_cleanup_summary(server_id):
    from services.cleanup_service import CleanupService
    session, error_response, status_code = require_permission_auth('cleanup_server')
    if error_response:
        return error_response, status_code
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        if not username or not password:
            return jsonify({'success': False, 'error': 'SSH credentials required'}), 400
        server_ip = server_id.replace('server-', '').replace('-', '.')
        result = CleanupService(_db).get_cleanup_summary(
            server_ip=server_ip, username=username,
            password=password, ssh_port=data.get('ssh_port', 22)
        )
        if result['success']:
            return jsonify(result)
        return jsonify(result), 500
    except Exception as e:
        logger.error(f"Error getting cleanup summary: {e}")
        return jsonify({'success': False, 'error': 'Failed to get cleanup summary'}), 500


@server_bp.route('/api/admin/servers/<server_id>/cleanup/execute', methods=['POST'])
def execute_cleanup(server_id):
    from services.cleanup_service import CleanupService
    session, error_response, status_code = require_permission_auth('cleanup_server')
    if error_response:
        return error_response, status_code
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        cleanup_options = data.get('cleanup_options', {})
        if not username or not password:
            return jsonify({'success': False, 'error': 'SSH credentials required'}), 400
        if not cleanup_options:
            return jsonify({'success': False, 'error': 'Cleanup options required'}), 400
        server_ip = server_id.replace('server-', '').replace('-', '.')
        result = CleanupService(_db).execute_cleanup(
            server_ip=server_ip, username=username, password=password,
            cleanup_options=cleanup_options, admin_username=session.get('username'),
            ssh_port=data.get('ssh_port', 22), ip_address=get_client_ip(request)
        )
        if result['success']:
            return jsonify(result)
        return jsonify(result), 500
    except Exception as e:
        logger.error(f"Error executing cleanup: {e}")
        return jsonify({'success': False, 'error': 'Failed to execute cleanup'}), 500
