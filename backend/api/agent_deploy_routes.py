"""
Agent Deployment API Routes
----------------------------
API endpoints for deploying agents to remote servers.
"""

import uuid
from flask import Blueprint, request, jsonify
from loguru import logger

from services.agent_deploy_service import (
    agent_deploy_service, 
    DeploymentConfig,
    DeploymentStatus
)
from database import UserDatabase
from utils.permissions import check_permission_for_session


agent_deploy_bp = Blueprint('agent_deploy', __name__)
db = UserDatabase()


def get_auth_info():
    """Get authentication info from request."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
    return token, ip_address


@agent_deploy_bp.route('/api/admin/agent-deploy/test-connection', methods=['POST'])
def test_connection():
    """Test SSH connection to a remote server."""
    token, ip_address = get_auth_info()
    
    # Require add_server permission
    has_perm, session, error = check_permission_for_session(db, token, 'add_server')
    if not has_perm:
        return jsonify({'success': False, 'error': error}), 403 if session else 401
    
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': 'Request data required'}), 400
    
    server_ip = data.get('server_ip', '').strip()
    ssh_user = data.get('ssh_user', '').strip()
    ssh_password = data.get('ssh_password', '')
    ssh_port = int(data.get('ssh_port', 22))
    
    if not server_ip:
        return jsonify({'success': False, 'error': 'Server IP is required'}), 400
    if not ssh_user:
        return jsonify({'success': False, 'error': 'SSH user is required'}), 400
    if not ssh_password:
        return jsonify({'success': False, 'error': 'SSH password is required'}), 400
    
    result = agent_deploy_service.test_connection(
        server_ip=server_ip,
        ssh_user=ssh_user,
        ssh_password=ssh_password,
        ssh_port=ssh_port
    )
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400


@agent_deploy_bp.route('/api/admin/agent-deploy/check-prerequisites', methods=['POST'])
def check_prerequisites():
    """Check prerequisites on a remote server."""
    token, ip_address = get_auth_info()
    
    has_perm, session, error = check_permission_for_session(db, token, 'add_server')
    if not has_perm:
        return jsonify({'success': False, 'error': error}), 403 if session else 401
    
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': 'Request data required'}), 400
    
    try:
        config = DeploymentConfig(
            server_ip=data.get('server_ip', '').strip(),
            ssh_user=data.get('ssh_user', '').strip(),
            ssh_password=data.get('ssh_password', ''),
            ssh_port=int(data.get('ssh_port', 22)),
            docker_image=data.get('docker_image', 'gpu-dev-env-test'),
            registry_url=data.get('registry_url', ''),
            registry_user=data.get('registry_user', ''),
            registry_password=data.get('registry_password', '')
        )
        
        from services.agent_deploy_service import DeploymentProgress
        progress = DeploymentProgress()
        
        checks = agent_deploy_service.check_prerequisites(config, progress)
        
        return jsonify({
            'success': True,
            'prerequisites': progress.prerequisites,
            'logs': progress.logs
        })
        
    except Exception as e:
        logger.error(f"Error checking prerequisites: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@agent_deploy_bp.route('/api/admin/agent-deploy/deploy', methods=['POST'])
def deploy_agent():
    """Start agent deployment to a remote server."""
    token, ip_address = get_auth_info()
    
    has_perm, session, error = check_permission_for_session(db, token, 'add_server')
    if not has_perm:
        return jsonify({'success': False, 'error': error}), 403 if session else 401
    
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': 'Request data required'}), 400
    
    # Validate required fields
    required_fields = ['server_ip', 'ssh_user', 'ssh_password']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'error': f'{field} is required'}), 400
    
    try:
        config = DeploymentConfig(
            server_ip=data.get('server_ip', '').strip(),
            ssh_user=data.get('ssh_user', '').strip(),
            ssh_password=data.get('ssh_password', ''),
            ssh_port=int(data.get('ssh_port', 22)),
            agent_port=int(data.get('agent_port', 8510)),
            agent_install_path=data.get('agent_install_path', '/opt/gpu-agent'),
            template_source_path=data.get('template_source_path', ''),
            template_deploy_path=data.get('template_deploy_path', ''),
            manager_ip=data.get('manager_ip', ''),
            manager_port=int(data.get('manager_port', 8500)),
            docker_image=data.get('docker_image', 'gpu-dev-env-test'),
            docker_tag=data.get('docker_tag', 'latest'),
            service_user=data.get('service_user', ''),
            create_venv=data.get('create_venv', True),
            registry_url=data.get('registry_url', ''),
            registry_user=data.get('registry_user', ''),
            registry_password=data.get('registry_password', '')
        )
        
        deployment_id = str(uuid.uuid4())
        
        progress = agent_deploy_service.deploy_agent(config, deployment_id)
        
        return jsonify({
            'success': True,
            'deployment_id': deployment_id,
            'message': 'Deployment started',
            'status': progress.to_dict()
        })
        
    except Exception as e:
        logger.error(f"Error starting deployment: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@agent_deploy_bp.route('/api/admin/agent-deploy/status/<deployment_id>', methods=['GET'])
def get_deployment_status(deployment_id):
    """Get status of an ongoing deployment."""
    token, ip_address = get_auth_info()
    
    has_perm, session, error = check_permission_for_session(db, token, 'add_server')
    if not has_perm:
        return jsonify({'success': False, 'error': error}), 403 if session else 401
    
    progress = agent_deploy_service.get_deployment_status(deployment_id)
    
    if not progress:
        return jsonify({'success': False, 'error': 'Deployment not found'}), 404
    
    return jsonify({
        'success': True,
        'status': progress.to_dict()
    })


@agent_deploy_bp.route('/api/admin/agent-deploy/template-paths', methods=['GET'])
def get_template_paths():
    """Get available template paths from the management server."""
    import os
    
    token, ip_address = get_auth_info()
    
    has_perm, session, error = check_permission_for_session(db, token, 'add_server')
    if not has_perm:
        return jsonify({'success': False, 'error': error}), 403 if session else 401
    
    # Get template path from environment or default locations
    template_paths = []
    
    # Check common locations
    possible_paths = [
        os.getenv('WORKDIR_TEMPLATE', ''),
        '/home/vishwa/user-repo/template',
        os.path.expanduser('~/user-repo/template'),
        '/opt/templates',
    ]
    
    for path in possible_paths:
        if path and os.path.exists(path) and os.path.isdir(path):
            # Get directory contents
            contents = os.listdir(path)
            template_paths.append({
                'path': path,
                'contents': contents[:10],  # Limit to first 10 items
                'item_count': len(contents)
            })
    
    return jsonify({
        'success': True,
        'templates': template_paths
    })


def init_agent_deploy_routes(app):
    """Initialize agent deployment routes."""
    app.register_blueprint(agent_deploy_bp)
