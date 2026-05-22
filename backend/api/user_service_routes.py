"""User-facing container management, service discovery, and log routes."""

import os
import json
from datetime import datetime
from flask import Blueprint, request, jsonify, Response
from loguru import logger

from database import UserDatabase
from services.user_service import UserService
from services.agent_service import AgentService
from services.nginx_service import NginxService
from utils.helpers import get_client_ip
from utils.auth_helpers import require_session_auth, require_admin_auth
from utils.app_logger import app_logs, add_app_log

user_service_bp = Blueprint('user_service', __name__)

_db = UserDatabase()
_agent_port = int(os.getenv('AGENT_PORT', '8510'))
_nginx_config = os.getenv('NGINX_CONFIG_FILE', 'backend/nginx/sites-available/dev-services')
_user_service = UserService(_db, _nginx_config, _agent_port)
_agent_service = AgentService(_agent_port, 20)
_nginx_service = NginxService(_nginx_config)


# ── Service discovery ───────────────────────────────────────────────────────

@user_service_bp.route('/api/user/services', methods=['GET'])
def get_user_services():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code

    username = session.get('username')
    try:
        add_app_log('INFO', f'User {username} accessed services dashboard', username, get_client_ip(request))

        route_info = _nginx_service.get_user_routes_info(username)
        user_data = _db.get_user_by_username(username)
        if not user_data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        metadata = _user_service._parse_user_metadata(user_data.get('metadata'))
        container_name = metadata.get('container', {}).get('name')
        server_assignment = metadata.get('server_assignment')
        real_container_status = 'stopped'
        container_id = None

        if container_name and server_assignment and server_assignment != 'NA':
            try:
                server_ip = _user_service._get_server_ip_from_assignment(server_assignment)
                if server_ip:
                    resp = _agent_service.query_agent_container_status(server_ip, container_name)
                    if resp and resp.get('success'):
                        real_container_status = resp.get('status', 'stopped')
                        container_id = resp.get('id')
            except Exception as e:
                logger.debug(f"Could not fetch real-time container status for {username}: {e}")

        mgmt_server = os.getenv('MGMT_SERVER_IP', 'localhost')
        services = {k: {'available': False, 'url': None, 'status': 'stopped'}
                    for k in ('vscode', 'jupyter', 'intellij', 'terminal')}

        if route_info.get('has_routes') and real_container_status == 'running':
            if route_info.get('vscode_url'):
                services['vscode'] = {'available': True, 'url': f"http://{mgmt_server}{route_info['vscode_url']}", 'status': 'running'}
            if route_info.get('jupyter_url'):
                services['jupyter'] = {'available': True, 'url': f"http://{mgmt_server}{route_info['jupyter_url']}", 'status': 'running'}
            services['intellij'] = {'available': True, 'url': f"http://{mgmt_server}/user/{username}/intellij/", 'status': 'running'}
            services['terminal'] = {'available': False, 'url': f"http://{mgmt_server}/user/{username}/terminal/", 'status': 'running'}
        elif real_container_status == 'running':
            try:
                server_ip = _user_service._get_server_ip_from_assignment(server_assignment) if server_assignment else None
                if server_ip:
                    port_resp = _agent_service.query_agent_port_info(server_ip, container_name)
                    if port_resp and port_resp.get('success'):
                        pi = port_resp.get('port_info', {})
                        code_port = pi.get('code_port', 9000)
                        services['vscode'] = {'available': True, 'url': f"http://{server_ip}:{code_port}/", 'status': 'running'}
                        services['jupyter'] = {'available': True, 'url': f"http://{server_ip}:{pi.get('jupyter_port', code_port+8)}/", 'status': 'running'}
            except Exception as e:
                logger.debug(f"Could not get direct service URLs for {username}: {e}")

        server_stats = None
        if server_assignment and server_assignment != 'NA':
            try:
                server_ip = _user_service._get_server_ip_from_assignment(server_assignment)
                if server_ip:
                    server_stats = _agent_service.query_agent_resources(server_ip)
            except Exception:
                pass

        return jsonify({
            'success': True,
            'data': {
                'username': username,
                'services': services,
                'container': {
                    'name': container_name or 'NA',
                    'id': container_id,
                    'status': real_container_status,
                    'server': server_assignment or 'NA',
                },
                'server_stats': server_stats,
                'nginx_available': route_info.get('nginx_available', False),
            }
        })
    except Exception as e:
        logger.error(f"Error getting user services for {username}: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch user services'}), 500


# ── Container control ───────────────────────────────────────────────────────

def _get_user_container_context(username):
    """Return (user_data, container_name, server_ip) or raise ValueError."""
    user_data = _db.get_user_by_username(username)
    if not user_data:
        raise ValueError('User not found')
    metadata = _user_service._parse_user_metadata(user_data.get('metadata'))
    container_name = metadata.get('container', {}).get('name')
    server_assignment = metadata.get('server_assignment')
    if not container_name:
        raise ValueError('No container assigned to user')
    if not server_assignment or server_assignment == 'NA':
        raise ValueError('No server assigned to user')
    server_ip = _user_service._get_server_ip_from_assignment(server_assignment)
    if not server_ip:
        raise ValueError('Could not determine server IP')
    return container_name, server_ip


@user_service_bp.route('/api/user/container/start', methods=['POST'])
def start_user_container():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    username = session.get('username')
    try:
        container_name, server_ip = _get_user_container_context(username)
        result = _agent_service.manage_user_container(server_ip, container_name, 'start')
        if result and result.get('success'):
            _db.log_audit_event(username, 'container_start',
                {'message': f'User {username} started container {container_name}',
                 'container_name': container_name, 'server_ip': server_ip},
                get_client_ip(request))
            add_app_log('INFO', f'Container {container_name} started successfully', username, get_client_ip(request))
            return jsonify({'success': True, 'message': 'Container started successfully'})
        error_msg = (result.get('error', 'Failed to start container') if result else 'Agent not available')
        add_app_log('ERROR', f'Failed to start container {container_name}: {error_msg}', username, get_client_ip(request))
        return jsonify({'success': False, 'error': error_msg}), 500
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error starting container for {username}: {e}")
        return jsonify({'success': False, 'error': 'Failed to start container'}), 500


@user_service_bp.route('/api/user/container/restart', methods=['POST'])
def restart_user_container():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    username = session.get('username')
    try:
        container_name, server_ip = _get_user_container_context(username)
        result = _agent_service.manage_user_container(server_ip, container_name, 'restart')
        if result and result.get('success'):
            _db.log_audit_event(username, 'container_restart',
                {'message': f'User {username} restarted container {container_name}',
                 'container_name': container_name, 'server_ip': server_ip},
                get_client_ip(request))
            add_app_log('INFO', f'Container {container_name} restarted successfully', username, get_client_ip(request))
            return jsonify({'success': True, 'message': 'Container restarted successfully'})
        error_msg = (result.get('error', 'Failed to restart container') if result else 'Agent not available')
        add_app_log('ERROR', f'Failed to restart container {container_name}: {error_msg}', username, get_client_ip(request))
        return jsonify({'success': False, 'error': error_msg}), 500
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error restarting container for {username}: {e}")
        return jsonify({'success': False, 'error': 'Failed to restart container'}), 500


@user_service_bp.route('/api/user/container/recreate', methods=['POST'])
def recreate_user_container():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    username = session.get('username')
    try:
        data = request.get_json() or {}
        wipe_data = data.get('wipe_data', False)
        container_name, server_ip = _get_user_container_context(username)
        result = _agent_service.recreate_user_container(server_ip, container_name, wipe_data=wipe_data)
        if result and result.get('success'):
            action_desc = 'with data wipe' if wipe_data else 'preserving data'
            _db.log_audit_event(username, 'container_recreate',
                {'message': f'User {username} recreated container {container_name} {action_desc}',
                 'container_name': container_name, 'server_ip': server_ip,
                 'wipe_data': wipe_data,
                 'container_stopped': result.get('container_stopped', False),
                 'container_removed': result.get('container_removed', False),
                 'data_wiped': result.get('data_wiped', False),
                 'container_created': result.get('container_created', False)},
                get_client_ip(request))
            add_app_log('INFO', f'Container {container_name} recreated {action_desc}', username, get_client_ip(request))
            return jsonify({'success': True,
                            'message': result.get('message', 'Container recreated successfully'),
                            'data_wiped': result.get('data_wiped', False)})
        error_msg = (result.get('error', result.get('message', 'Failed to recreate container')) if result else 'Agent not available')
        add_app_log('ERROR', f'Failed to recreate container {container_name}: {error_msg}', username, get_client_ip(request))
        return jsonify({'success': False, 'error': error_msg}), 500
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error recreating container for {username}: {e}")
        return jsonify({'success': False, 'error': 'Failed to recreate container'}), 500


@user_service_bp.route('/api/admin/users/<user_id>/container/recreate', methods=['POST'])
def admin_recreate_user_container(user_id):
    session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code
    admin_username = session.get('username')
    try:
        data = request.get_json() or {}
        wipe_data = data.get('wipe_data', False)

        user_data = _db.get_user_by_id(int(user_id))
        if not user_data:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        target_username = user_data.get('username')
        metadata = _user_service._parse_user_metadata(user_data.get('metadata'))
        container_name = metadata.get('container', {}).get('name')
        server_assignment = metadata.get('server_assignment')

        if not server_assignment or server_assignment == 'NA':
            return jsonify({'success': False, 'error': 'No server assigned to user'}), 400
        server_ip = _user_service._get_server_ip_from_assignment(server_assignment)
        if not server_ip:
            return jsonify({'success': False, 'error': 'Could not determine server IP'}), 400

        if not container_name:
            resources = metadata.get('resources', {})
            container_result = _user_service._create_user_container(target_username, server_ip, resources, _agent_port)
            if not (container_result.get('success') and container_result.get('container')):
                error_msg = container_result.get('error', 'Container creation failed')
                add_app_log('ERROR', f'Admin failed to create container for {target_username}: {error_msg}',
                            admin_username, get_client_ip(request))
                return jsonify({'success': False, 'error': error_msg}), 500

            container_info = container_result['container']
            metadata['container'] = {
                'name': container_info.get('name'),
                'id': container_info.get('id'),
                'status': container_info.get('status'),
                'created_at': datetime.now().isoformat(),
            }
            port_map = container_info.get('port_map', {})
            if port_map:
                nginx_result = _nginx_service.add_user_route(
                    target_username,
                    f"{server_ip}:{port_map.get('code', 8080)}",
                    f"{server_ip}:{port_map.get('jupyter', 8088)}"
                )
                metadata['nginx_routes'] = {
                    'configured': nginx_result.get('success', False),
                    'configured_at': datetime.now().isoformat(),
                }
            _db.update_user(int(user_id), {
                'is_approved': True,
                'redirect_url': f"http://{server_ip}:{_agent_port}",
                'metadata': metadata,
            })
            _db.log_audit_event(admin_username, 'admin_container_create',
                {'message': f'Admin {admin_username} created container for {target_username}',
                 'target_user': target_username,
                 'container_name': container_info.get('name'),
                 'server_ip': server_ip},
                get_client_ip(request))
            add_app_log('INFO', f"Created container {container_info.get('name')} for {target_username}",
                        admin_username, get_client_ip(request))
            return jsonify({'success': True, 'message': f"Container created for {target_username}", 'target_user': target_username})

        result = _agent_service.recreate_user_container(server_ip, container_name, wipe_data=wipe_data)
        if result and result.get('success'):
            action_desc = 'with data wipe' if wipe_data else 'preserving data'
            _db.log_audit_event(admin_username, 'admin_container_recreate',
                {'message': f'Admin {admin_username} recreated container for {target_username} {action_desc}',
                 'target_user': target_username, 'target_user_id': user_id,
                 'container_name': container_name, 'server_ip': server_ip, 'wipe_data': wipe_data,
                 'container_stopped': result.get('container_stopped', False),
                 'container_removed': result.get('container_removed', False),
                 'data_wiped': result.get('data_wiped', False),
                 'container_created': result.get('container_created', False)},
                get_client_ip(request))
            add_app_log('INFO', f'Admin {admin_username} recreated container for {target_username} {action_desc}',
                        admin_username, get_client_ip(request))
            return jsonify({'success': True,
                            'message': result.get('message', 'Container recreated successfully'),
                            'data_wiped': result.get('data_wiped', False),
                            'target_user': target_username})
        error_msg = (result.get('error', result.get('message', 'Failed to recreate container')) if result else 'Agent not available')
        add_app_log('ERROR', f'Admin failed to recreate container for {target_username}: {error_msg}',
                    admin_username, get_client_ip(request))
        return jsonify({'success': False, 'error': error_msg}), 500
    except Exception as e:
        logger.error(f"Error recreating container for user {user_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to recreate container'}), 500


# ── User logs ───────────────────────────────────────────────────────────────

@user_service_bp.route('/api/user/logs', methods=['GET'])
def get_user_logs():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    username = session.get('username')
    limit = request.args.get('limit', 100, type=int)
    level_filter = request.args.get('level')
    try:
        user_logs = []
        for entry in reversed(list(app_logs)):
            if entry.get('username') in (username, None):
                if level_filter is None or entry.get('level') == level_filter:
                    user_logs.append(entry)
                    if len(user_logs) >= limit:
                        break
        return jsonify({'success': True, 'logs': user_logs, 'total': len(user_logs)})
    except Exception as e:
        logger.error(f"Error retrieving logs for {username}: {e}")
        return jsonify({'success': False, 'error': 'Failed to retrieve logs'}), 500


@user_service_bp.route('/api/user/logs/download', methods=['GET'])
def download_user_logs():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    username = session.get('username')
    try:
        lines = [
            f"[{e.get('timestamp','')}] {e.get('level','INFO')}: {e.get('message','')}"
            for e in app_logs
            if e.get('username') in (username, None)
        ]
        add_app_log('INFO', f'User {username} downloaded logs', username, get_client_ip(request))
        filename = f"logs_{username}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        return Response(
            '\n'.join(lines),
            mimetype='text/plain',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    except Exception as e:
        logger.error(f"Error downloading logs for {username}: {e}")
        return jsonify({'success': False, 'error': 'Failed to download logs'}), 500
