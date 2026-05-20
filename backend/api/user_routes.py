"""User and admin-user management routes."""

import os
from flask import Blueprint, request, jsonify
from loguru import logger

from database import UserDatabase
from services.user_service import UserService
from utils.helpers import get_client_ip
from utils.auth_helpers import require_admin_auth, require_permission_auth, require_session_auth

user_bp = Blueprint('user', __name__)

_db = UserDatabase()
_nginx_config = os.getenv('NGINX_CONFIG_FILE', 'backend/nginx/sites-available/dev-services')
_agent_port = int(os.getenv('AGENT_PORT', '8510'))
_user_service = UserService(_db, _nginx_config, _agent_port)


# ── User endpoints ──────────────────────────────────────────────────────────

@user_bp.route('/api/users', methods=['GET'])
def get_users():
    session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code
    users = _user_service.get_all_users()
    if users:
        return jsonify({'success': True, 'users': users})
    return jsonify({'success': False, 'error': 'No users found'}), 404


@user_bp.route('/api/users/<int:user_id>', methods=['GET'])
def get_user_info(user_id):
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    user = _user_service.get_user_by_id(user_id)
    if user:
        return jsonify({'success': True, 'redirect_url': user.get('redirect_url', '')})
    return jsonify({'success': False, 'error': 'User not found'}), 404


@user_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    session, error_response, status_code = require_permission_auth('delete_user')
    if error_response:
        return error_response, status_code

    if request.is_json and request.json:
        delete_workspace = request.json.get('delete_workspace', False)
    else:
        delete_workspace = request.args.get('delete_workspace', 'false').lower() == 'true'

    result = _user_service.delete_user(user_id, session.get('username', 'admin'), delete_workspace=delete_workspace, ip_address=get_client_ip(request))

    status = 200 if result['success'] else 400
    return jsonify({
        'success': result['success'],
        'message': result['message'],
        'user_deleted': result['user_deleted'],
        'container_deleted': result['container_deleted'],
        'container_details': result.get('container_details'),
        'workspace_deleted': result.get('workspace_deleted', False),
        'workspace_path': result.get('workspace_path'),
    }), status


@user_bp.route('/api/users/pending', methods=['GET'])
def get_pending_users():
    session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code
    users = _user_service.get_pending_users()
    if users:
        return jsonify({'success': True, 'users': users})
    return jsonify({'success': False, 'error': 'No pending users'}), 200


# ── Admin user endpoints ────────────────────────────────────────────────────

@user_bp.route('/api/admin/users/<int:user_id>/approve', methods=['POST'])
def approve_user(user_id):
    session, error_response, status_code = require_permission_auth('approve_user')
    if error_response:
        return error_response, status_code

    data = request.get_json()
    result = _user_service.approve_user(
        user_id, data.get('server'), session.get('username'),
        _agent_port, get_client_ip(request), data.get('resources', {})
    )
    if result.get('success'):
        return jsonify(result)
    return jsonify(result), 400


@user_bp.route('/api/admin/users', methods=['GET'])
def get_admin_users():
    try:
        return jsonify({'success': True, 'users': _user_service.get_admin_users()})
    except Exception as e:
        logger.error(f"Error fetching admin users: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch users'}), 500


@user_bp.route('/api/admin/stats', methods=['GET'])
def get_admin_stats():
    try:
        return jsonify({'success': True, 'stats': _user_service.get_admin_stats()})
    except Exception as e:
        logger.error(f"Error fetching admin stats: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch statistics'}), 500


@user_bp.route('/api/admin/users/<int:user_id>', methods=['PUT'])
def update_admin_user(user_id):
    session, error_response, status_code = require_permission_auth('update_user')
    if error_response:
        return error_response, status_code
    try:
        success = _user_service.update_admin_user(
            user_id, request.get_json(), session.get('username', 'admin'), get_client_ip(request)
        )
        if success:
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'User not found'}), 404
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}")
        return jsonify({'success': False, 'error': 'Failed to update user'}), 500


@user_bp.route('/api/admin/users', methods=['POST'])
def create_admin_user():
    session, error_response, status_code = require_permission_auth('create_user')
    if error_response:
        return error_response, status_code
    try:
        result = _user_service.create_admin_user(request.get_json(), session.get('username', 'admin'))
        if result['success']:
            return jsonify(result)
        return jsonify(result), 400
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        return jsonify({'success': False, 'error': 'Failed to create user'}), 500


# ── Password reset endpoints ────────────────────────────────────────────────

@user_bp.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST'])
def admin_reset_user_password(user_id):
    session, error_response, status_code = require_permission_auth('reset_password')
    if error_response:
        return error_response, status_code
    try:
        data = request.get_json()
        new_password = data.get('new_password')
        if not new_password:
            return jsonify({'success': False, 'error': 'New password is required'}), 400
        if len(new_password) < 6:
            return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

        result = _user_service.admin_reset_password(user_id, new_password, session.get('username'))
        if result['success']:
            for req in _user_service.get_pending_reset_requests():
                if req['user_id'] == user_id:
                    _user_service.complete_reset_request(req['id'], session.get('id'))
                    break
        if result['success']:
            return jsonify(result)
        return jsonify(result), 400
    except Exception as e:
        logger.error(f"Error resetting password: {e}")
        return jsonify({'success': False, 'error': 'Failed to reset password'}), 500


@user_bp.route('/api/user/request-password-reset', methods=['POST'])
def request_password_reset():
    session, error_response, status_code = require_session_auth()
    if error_response:
        return error_response, status_code
    try:
        data = request.get_json()
        result = _user_service.request_password_reset(session.get('id'), data.get('reason', ''))
        if result['success']:
            return jsonify(result)
        return jsonify(result), 400
    except Exception as e:
        logger.error(f"Error requesting password reset: {e}")
        return jsonify({'success': False, 'error': 'Failed to request password reset'}), 500


@user_bp.route('/api/public/request-password-reset', methods=['POST'])
def public_request_password_reset():
    try:
        data = request.get_json()
        email = data.get('email', '')
        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400
        user = _user_service.db.get_user_by_email(email)
        if user:
            _user_service.request_password_reset(user['id'], data.get('reason', ''))
        # Always return success to prevent email enumeration
        return jsonify({
            'success': True,
            'message': 'If your email is registered, a password reset request has been submitted.'
        })
    except Exception as e:
        logger.error(f"Error requesting password reset: {e}")
        return jsonify({'success': False, 'error': 'Failed to request password reset'}), 500


@user_bp.route('/api/admin/password-reset-requests', methods=['GET'])
def get_password_reset_requests():
    session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code
    try:
        return jsonify({
            'success': True,
            'requests': _user_service.get_pending_reset_requests(),
            'count': _user_service.get_pending_reset_count(),
        })
    except Exception as e:
        logger.error(f"Error fetching password reset requests: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch requests'}), 500


@user_bp.route('/api/admin/password-reset-requests/<int:request_id>/reject', methods=['POST'])
def reject_password_reset_request(request_id):
    session, error_response, status_code = require_admin_auth()
    if error_response:
        return error_response, status_code
    try:
        success = _user_service.reject_reset_request(request_id, session.get('id'))
        if success:
            return jsonify({'success': True, 'message': 'Password reset request rejected'})
        return jsonify({'success': False, 'error': 'Failed to reject request'}), 400
    except Exception as e:
        logger.error(f"Error rejecting reset request: {e}")
        return jsonify({'success': False, 'error': 'Failed to reject request'}), 500
