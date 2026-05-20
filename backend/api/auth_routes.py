"""Authentication routes: login, logout, register, validate-session."""

from flask import Blueprint, request, jsonify
from loguru import logger

from database import UserDatabase
from services.auth_service import AuthService
from utils.helpers import get_client_ip
from utils.validators import is_valid_email

auth_bp = Blueprint('auth', __name__)

_db = UserDatabase()
_auth_service = AuthService(_db)


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    result = _auth_service.login(email, password, get_client_ip(request))

    if result.success:
        return jsonify({
            'success': True,
            'data': {
                'user_id': result.user_id,
                'name': result.username,
                'role': result.role,
                'user_type': result.user_type,
                'permissions': result.permissions,
                'email': email,
                'token': result.token,
            }
        })
    return jsonify({'success': False, 'error': result.message}), 401


@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Authorization required'}), 401
    token = auth_header.split(' ', 1)[1]
    success = _auth_service.logout(token, get_client_ip(request))
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Logout failed'}), 500


@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    result = _auth_service.register(
        data.get('username'), data.get('password'), data.get('email'), get_client_ip(request)
    )
    if result['success']:
        return jsonify(result)
    return jsonify(result), 400


@auth_bp.route('/api/validate-session', methods=['GET'])
def validate_session():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Authorization required'}), 401
    token = auth_header.split(' ', 1)[1]
    session = _auth_service.validate_session(token)
    if session:
        return jsonify({'success': True, 'session': session})
    return jsonify({'success': False, 'error': 'Invalid session'}), 401
