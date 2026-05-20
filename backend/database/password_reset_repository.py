"""Password reset repository for database operations."""

import psycopg2
from typing import Dict, List, Optional
from datetime import datetime
from .base import DatabaseManager


class PasswordResetRepository:
    """Repository class for password reset request operations."""

    def __init__(self):
        """Initialize password reset repository."""
        self.db_manager = DatabaseManager()

    def create_reset_request(self, user_id: int, reason: Optional[str] = None) -> bool:
        """Create a new password reset request."""
        query = """
        INSERT INTO password_reset_requests (user_id, reason, status)
        VALUES (%s, %s, 'pending')
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (user_id, reason))
            conn.commit()
            return True
        except psycopg2.Error as e:
            print(f"Error creating password reset request: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def get_pending_requests(self) -> List[Dict]:
        """Get all pending password reset requests."""
        query = """
        SELECT
            prr.id,
            prr.user_id,
            prr.requested_at,
            prr.reason,
            u.username,
            u.email
        FROM password_reset_requests prr
        JOIN users u ON prr.user_id = u.id
        WHERE prr.status = 'pending'
        ORDER BY prr.requested_at DESC
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            return cursor.fetchall()
        finally:
            cursor.close()
            conn.close()

    def get_pending_count(self) -> int:
        """Get count of pending password reset requests."""
        query = """
        SELECT COUNT(*) as count
        FROM password_reset_requests
        WHERE status = 'pending'
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            result = cursor.fetchone()
            return result['count'] if result else 0
        finally:
            cursor.close()
            conn.close()

    def get_request_by_id(self, request_id: int) -> Optional[Dict]:
        """Get a specific password reset request by ID."""
        query = """
        SELECT
            prr.id,
            prr.user_id,
            prr.requested_at,
            prr.status,
            prr.reason,
            u.username,
            u.email
        FROM password_reset_requests prr
        JOIN users u ON prr.user_id = u.id
        WHERE prr.id = %s
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (request_id,))
            return cursor.fetchone()
        finally:
            cursor.close()
            conn.close()

    def complete_request(self, request_id: int, admin_id: int) -> bool:
        """Mark a password reset request as completed."""
        query = """
        UPDATE password_reset_requests
        SET status = 'completed', admin_id = %s, completed_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (admin_id, request_id))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error completing password reset request: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def reject_request(self, request_id: int, admin_id: int) -> bool:
        """Mark a password reset request as rejected."""
        query = """
        UPDATE password_reset_requests
        SET status = 'rejected', admin_id = %s, completed_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (admin_id, request_id))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error rejecting password reset request: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def has_pending_request(self, user_id: int) -> bool:
        """Check if user already has a pending password reset request."""
        query = """
        SELECT COUNT(*) as count
        FROM password_reset_requests
        WHERE user_id = %s AND status = 'pending'
        """
        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (user_id,))
            result = cursor.fetchone()
            return result['count'] > 0 if result else False
        finally:
            cursor.close()
            conn.close()
