"""Session repository for database operations."""

import psycopg2
from datetime import datetime
from typing import Dict, Optional
from .base import DatabaseManager


class SessionRepository:
    """Repository class for session-related database operations."""

    def __init__(self):
        """Initialize session repository."""
        self.db_manager = DatabaseManager()

    def create_session(self, user_id: int, session_token: str, expires_at: datetime) -> bool:
        """Create a new user session."""
        query = """
        INSERT INTO user_sessions (user_id, session_token, expires_at)
        VALUES (%s, %s, %s)
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (user_id, session_token, expires_at))
            conn.commit()
            return True
        except psycopg2.Error:
            return False
        finally:
            cursor.close()
            conn.close()

    def verify_session(self, session_token: str) -> Optional[Dict]:
        """Verify a session token and return user data if valid."""
        query = """
        SELECT u.* FROM users u
        JOIN user_sessions s ON u.id = s.user_id
        WHERE s.session_token = %s AND s.expires_at > CURRENT_TIMESTAMP
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (session_token,))
            return cursor.fetchone()
        finally:
            cursor.close()
            conn.close()

    def remove_session(self, session_token: str = None) -> bool:
        """Remove a session by token."""
        if not session_token:
            return False

        query = "DELETE FROM user_sessions WHERE session_token = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (session_token,))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error removing session: {e}")
            return False
        finally:
            cursor.close()
            conn.close()
