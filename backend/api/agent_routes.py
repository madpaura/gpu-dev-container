"""Agent registration, unregistration, and heartbeat routes."""

from flask import Blueprint, request, jsonify
from loguru import logger

from database import UserDatabase, AgentRepository
from utils.helpers import get_client_ip

agent_bp = Blueprint('agent', __name__)

_db = UserDatabase()
_agent_repo = AgentRepository()


@agent_bp.route('/api/register_agent', methods=['POST'])
def register_agent():
    data = request.get_json() or {}
    agent_ip = data.get('agent_ip')
    if not agent_ip:
        return jsonify({'success': False, 'error': 'Agent IP required'}), 400
    try:
        is_new = not _agent_repo.agent_exists(agent_ip)
        if not _agent_repo.register_agent(agent_ip):
            return jsonify({'success': False, 'error': 'Failed to register agent'}), 500
        if is_new:
            _db.log_audit_event(
                'System', 'register_agent',
                {'message': f'New agent registered: {agent_ip}', 'agent_ip': agent_ip},
                get_client_ip(request)
            )
        return jsonify({'success': True, 'message': f'Agent {agent_ip} registered'})
    except Exception as e:
        logger.error(f"Error registering agent: {e}")
        return jsonify({'success': False, 'error': 'Failed to register agent'}), 500


@agent_bp.route('/api/unregister_agent', methods=['POST'])
def unregister_agent():
    data = request.get_json() or {}
    agent_ip = data.get('agent_ip')
    if not agent_ip:
        return jsonify({'success': False, 'error': 'Agent IP required'}), 400
    try:
        _agent_repo.unregister_agent(agent_ip)
        _db.log_audit_event(
            'System', 'unregister_agent',
            {'message': f'Agent unregistered: {agent_ip}', 'agent_ip': agent_ip},
            get_client_ip(request)
        )
        return jsonify({'success': True, 'message': f'Agent {agent_ip} unregistered'})
    except Exception as e:
        logger.error(f"Error unregistering agent: {e}")
        return jsonify({'success': False, 'error': 'Failed to unregister agent'}), 500


@agent_bp.route('/api/agent/heartbeat', methods=['POST'])
def agent_heartbeat():
    data = request.get_json() or {}
    agent_ip = data.get('agent_ip')
    if not agent_ip:
        return jsonify({'success': False, 'error': 'Agent IP required'}), 400
    try:
        _agent_repo.update_heartbeat(agent_ip)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error updating heartbeat for {agent_ip}: {e}")
        return jsonify({'success': False, 'error': 'Heartbeat update failed'}), 500
