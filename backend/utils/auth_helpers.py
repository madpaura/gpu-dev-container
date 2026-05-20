"""Authentication guard functions shared across route blueprints."""

from flask import request, jsonify


def _get_token():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header.split(' ', 1)[1]
    return None


def require_admin_auth():
    """Allow admin and qvp user types."""
    from services.auth_service import AuthService
    from database import UserDatabase

    token = _get_token()
    if not token:
        return None, jsonify({'success': False, 'error': 'Authorization required'}), 401

    session = AuthService(UserDatabase()).validate_session(token)
    if not session:
        return None, jsonify({'success': False, 'error': 'Unauthorized'}), 401

    user_type = session.get('user_type', 'regular')
    if user_type not in ('admin', 'qvp') and not session.get('is_admin'):
        return None, jsonify({'success': False, 'error': 'Admin access required'}), 403

    return session, None, None


def require_permission_auth(permission: str):
    """Require a specific named permission."""
    from services.auth_service import AuthService
    from database import UserDatabase
    from utils.permissions import has_permission

    token = _get_token()
    if not token:
        return None, jsonify({'success': False, 'error': 'Authorization required'}), 401

    session = AuthService(UserDatabase()).validate_session(token)
    if not session:
        return None, jsonify({'success': False, 'error': 'Unauthorized'}), 401

    user_type = session.get('user_type', 'regular')
    if not user_type or user_type == 'regular':
        if session.get('is_admin'):
            user_type = 'admin'

    if not has_permission(user_type, permission):
        return None, jsonify({
            'success': False,
            'error': f'Permission denied. This action requires {permission} permission.'
        }), 403

    return session, None, None


def require_session_auth():
    """Require any valid session."""
    from database import UserDatabase

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None, jsonify({'success': False, 'error': 'Authorization required'}), 401

    token = auth_header.split(' ', 1)[1]
    session = UserDatabase().verify_session(token)
    if not session:
        return None, jsonify({'success': False, 'error': 'Invalid session'}), 401

    return session, None, None


def require_session_auth_docker():
    """Session auth with Docker-style error format."""
    from database import UserDatabase

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None, jsonify({'error': 'No authorization token provided'}), 401

    token = auth_header.split(' ', 1)[1]
    session = UserDatabase().verify_session(token)
    if not session:
        return None, jsonify({'error': 'Invalid session token'}), 401

    return session, None, None


def require_admin_auth_with_db():
    """Admin auth using direct DB session validation (for audit endpoints)."""
    from database import UserDatabase

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None, jsonify({'success': False, 'error': 'No authorization token provided'}), 401

    token = auth_header.split(' ', 1)[1]
    user_info = UserDatabase().validate_session(token)
    if not user_info:
        return None, jsonify({'success': False, 'error': 'Invalid session'}), 401

    user_type = user_info.get('user_type', 'regular')
    if user_type not in ('admin', 'qvp') and user_info.get('role') != 'admin':
        return None, jsonify({'success': False, 'error': 'Admin access required'}), 403

    return user_info, None, None
