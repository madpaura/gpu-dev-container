"""Traffic tracking repository for user access analytics."""

import psycopg2
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from .base import DatabaseManager


class TrafficRepository:
    """Repository for user traffic and access analytics."""

    def __init__(self):
        """Initialize traffic repository."""
        self.db_manager = DatabaseManager()

    def log_access(self, access_data: Dict[str, Any]) -> bool:
        """Log a user access event."""
        query = """
        INSERT INTO user_access_logs
        (user_id, session_token, ip_address, user_agent, endpoint, method,
         status_code, access_time, session_start, bytes_sent, bytes_received)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (
                access_data.get('user_id'),
                access_data.get('session_token'),
                access_data.get('ip_address'),
                access_data.get('user_agent'),
                access_data.get('endpoint'),
                access_data.get('method'),
                access_data.get('status_code'),
                access_data.get('access_time', datetime.now()),
                access_data.get('session_start'),
                access_data.get('bytes_sent', 0),
                access_data.get('bytes_received', 0)
            ))
            conn.commit()
            return True
        except psycopg2.Error as e:
            print(f"Error logging access: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def update_session_end(self, session_token: str, end_time: datetime = None) -> bool:
        """Update session end time and calculate duration."""
        if end_time is None:
            end_time = datetime.now()

        query = """
        UPDATE user_access_logs
        SET session_end = %s,
            duration_seconds = EXTRACT(EPOCH FROM (%s - session_start))::INT
        WHERE session_token = %s AND session_end IS NULL
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (end_time, end_time, session_token))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error updating session end: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def get_traffic_analytics(self,
                            start_date: datetime = None,
                            end_date: datetime = None,
                            ip_filter: str = None,
                            user_filter: str = None) -> Dict[str, Any]:
        """Get comprehensive traffic analytics."""
        if start_date is None:
            start_date = datetime.now() - timedelta(days=30)
        if end_date is None:
            end_date = datetime.now()

        where_conditions = ["access_time BETWEEN %s AND %s"]
        params = [start_date, end_date]

        if ip_filter:
            where_conditions.append("ip_address LIKE %s")
            params.append(f"%{ip_filter}%")

        if user_filter:
            where_conditions.append("u.username LIKE %s")
            params.append(f"%{user_filter}%")

        where_clause = " AND ".join(where_conditions)

        query = f"""
        SELECT
            access_time::DATE as date,
            COUNT(*) as total_requests,
            COUNT(DISTINCT ip_address) as unique_ips,
            COUNT(DISTINCT user_id) as unique_users,
            AVG(COALESCE(duration_seconds, 0)) as avg_duration,
            SUM(bytes_sent) as total_bytes_sent,
            SUM(bytes_received) as total_bytes_received,
            COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
        FROM user_access_logs ual
        LEFT JOIN users u ON ual.user_id = u.id
        WHERE {where_clause}
        GROUP BY access_time::DATE
        ORDER BY date DESC
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, params)
            daily_stats = cursor.fetchall()

            top_ips_query = f"""
            SELECT
                ip_address,
                COUNT(*) as request_count,
                COUNT(DISTINCT user_id) as unique_users,
                AVG(COALESCE(duration_seconds, 0)) as avg_duration
            FROM user_access_logs ual
            LEFT JOIN users u ON ual.user_id = u.id
            WHERE {where_clause}
            GROUP BY ip_address
            ORDER BY request_count DESC
            LIMIT 10
            """
            cursor.execute(top_ips_query, params)
            top_ips = cursor.fetchall()

            top_users_query = f"""
            SELECT
                u.username,
                u.email,
                COUNT(*) as request_count,
                COUNT(DISTINCT ip_address) as unique_ips,
                AVG(COALESCE(duration_seconds, 0)) as avg_duration,
                MAX(access_time) as last_access
            FROM user_access_logs ual
            JOIN users u ON ual.user_id = u.id
            WHERE {where_clause}
            GROUP BY u.id, u.username, u.email
            ORDER BY request_count DESC
            LIMIT 10
            """
            cursor.execute(top_users_query, params)
            top_users = cursor.fetchall()

            hourly_query = f"""
            SELECT
                EXTRACT(HOUR FROM access_time)::INT as hour,
                COUNT(*) as request_count
            FROM user_access_logs ual
            LEFT JOIN users u ON ual.user_id = u.id
            WHERE {where_clause}
            GROUP BY EXTRACT(HOUR FROM access_time)
            ORDER BY hour
            """
            cursor.execute(hourly_query, params)
            hourly_distribution = cursor.fetchall()

            endpoint_query = f"""
            SELECT
                endpoint,
                COUNT(*) as request_count,
                AVG(COALESCE(duration_seconds, 0)) as avg_duration,
                COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
            FROM user_access_logs ual
            LEFT JOIN users u ON ual.user_id = u.id
            WHERE {where_clause} AND endpoint IS NOT NULL
            GROUP BY endpoint
            ORDER BY request_count DESC
            LIMIT 20
            """
            cursor.execute(endpoint_query, params)
            endpoint_stats = cursor.fetchall()

            return {
                'daily_stats': daily_stats,
                'top_ips': top_ips,
                'top_users': top_users,
                'hourly_distribution': hourly_distribution,
                'endpoint_stats': endpoint_stats,
                'date_range': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat()
                }
            }

        except psycopg2.Error as e:
            print(f"Error getting traffic analytics: {e}")
            return {}
        finally:
            cursor.close()
            conn.close()

    def get_user_sessions(self, user_id: int = None, ip_address: str = None) -> List[Dict[str, Any]]:
        """Get detailed user session information."""
        where_conditions = []
        params = []

        if user_id:
            where_conditions.append("ual.user_id = %s")
            params.append(user_id)

        if ip_address:
            where_conditions.append("ual.ip_address = %s")
            params.append(ip_address)

        where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""

        query = f"""
        SELECT
            ual.session_token,
            ual.ip_address,
            u.username,
            u.email,
            MIN(ual.access_time) as session_start,
            MAX(ual.session_end) as session_end,
            MAX(ual.duration_seconds) as total_duration,
            COUNT(*) as request_count,
            COUNT(DISTINCT ual.endpoint) as unique_endpoints
        FROM user_access_logs ual
        LEFT JOIN users u ON ual.user_id = u.id
        {where_clause}
        GROUP BY ual.session_token, ual.ip_address, u.username, u.email
        ORDER BY session_start DESC
        LIMIT 100
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, params)
            return cursor.fetchall()
        except psycopg2.Error as e:
            print(f"Error getting user sessions: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def get_traffic_summary(self) -> Dict[str, Any]:
        """Get overall traffic summary statistics."""
        query = """
        SELECT
            COUNT(*) as total_requests,
            COUNT(DISTINCT ip_address) as unique_ips,
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(DISTINCT session_token) as total_sessions,
            AVG(COALESCE(duration_seconds, 0)) as avg_session_duration,
            SUM(bytes_sent) as total_bytes_sent,
            SUM(bytes_received) as total_bytes_received,
            MIN(access_time) as first_access,
            MAX(access_time) as last_access
        FROM user_access_logs
        WHERE access_time >= NOW() - INTERVAL '30 days'
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            result = cursor.fetchone()
            return result or {}
        except psycopg2.Error as e:
            print(f"Error getting traffic summary: {e}")
            return {}
        finally:
            cursor.close()
            conn.close()
