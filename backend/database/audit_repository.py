"""Audit repository for database operations."""

import psycopg2
import json
from typing import Dict, List
from .base import DatabaseManager
from .user_repository import UserRepository


class AuditRepository:
    """Repository class for audit log-related database operations."""

    def __init__(self):
        """Initialize audit repository."""
        self.db_manager = DatabaseManager()
        self.user_repo = UserRepository()

    def log_audit(self, user_id: int, action_type: str, action_details: Dict, ip_address: str):
        """Log user actions for audit."""
        query = """
        INSERT INTO audit_log (user_id, action_type, action_details, ip_address)
        VALUES (%s, %s, %s, %s)
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (
                user_id,
                action_type,
                json.dumps(action_details),
                ip_address
            ))
            conn.commit()
        finally:
            cursor.close()
            conn.close()

    def log_audit_event(self, username: str, action_type: str, action_details: Dict, ip_address: str):
        """Log user actions for audit using username instead of user_id."""
        user = self.user_repo.get_user_by_username(username)
        if user:
            user_id = user['id']
        else:
            if username.lower() == 'system':
                user_id = self.user_repo.get_or_create_system_user()
            else:
                admin_user = self.user_repo.get_user_by_username('admin')
                user_id = admin_user['id'] if admin_user else self.user_repo.get_or_create_system_user()

        self.log_audit(user_id, action_type, action_details, ip_address)

    def get_audit_logs(self, username: str = None, limit: int = 100) -> List[Dict]:
        """Get audit logs with optional username filter."""
        if username and username != "All Users":
            query = """
            SELECT a.*, u.username
            FROM audit_log a
            JOIN users u ON a.user_id = u.id
            WHERE u.username = %s
            ORDER BY a.timestamp DESC
            LIMIT %s
            """
            params = (username, limit)
        else:
            query = """
            SELECT a.*, u.username
            FROM audit_log a
            JOIN users u ON a.user_id = u.id
            ORDER BY a.timestamp DESC
            LIMIT %s
            """
            params = (limit,)

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, params)
            return cursor.fetchall()
        finally:
            cursor.close()
            conn.close()

    def clear_audit_logs(self) -> bool:
        """Clear all audit logs from the database."""
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM audit_log")
            conn.commit()
            return True
        except Exception as e:
            print(f"Error clearing audit logs: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()
