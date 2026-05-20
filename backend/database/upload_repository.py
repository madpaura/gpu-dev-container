"""Repository for upload server and guest OS image operations."""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from .base import DatabaseManager

logger = logging.getLogger(__name__)


class UploadServerRepository:
    """Repository for upload server CRUD operations."""

    def __init__(self):
        self.db = DatabaseManager()

    def create_server(self, data: Dict[str, Any], created_by: int = None) -> Optional[int]:
        """Create a new upload server."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO upload_servers
                (name, ip_address, port, protocol, username, password, ssh_key,
                 base_path, version_file_path, is_active, metadata, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                data.get('name'),
                data.get('ip_address'),
                data.get('port', 22),
                data.get('protocol', 'sftp'),
                data.get('username'),
                data.get('password'),
                data.get('ssh_key'),
                data.get('base_path'),
                data.get('version_file_path'),
                data.get('is_active', True),
                data.get('metadata'),
                created_by
            ))
            conn.commit()
            return cursor.fetchone()[0]
        except Exception as e:
            logger.error(f"Error creating upload server: {e}")
            conn.rollback()
            return None
        finally:
            cursor.close()
            conn.close()

    def get_server_by_id(self, server_id: int) -> Optional[Dict[str, Any]]:
        """Get an upload server by ID."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT us.*, u.username as created_by_name
                FROM upload_servers us
                LEFT JOIN users u ON us.created_by = u.id
                WHERE us.id = %s
            """, (server_id,))
            return cursor.fetchone()
        except Exception as e:
            logger.error(f"Error fetching upload server: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_server_with_credentials(self, server_id: int) -> Optional[Dict[str, Any]]:
        """Get an upload server with credentials (for internal use)."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT * FROM upload_servers WHERE id = %s
            """, (server_id,))
            return cursor.fetchone()
        except Exception as e:
            logger.error(f"Error fetching upload server with credentials: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_all_servers(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all upload servers."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            query = """
                SELECT us.id, us.name, us.ip_address, us.port, us.protocol,
                       us.username, us.base_path, us.version_file_path,
                       us.is_active, us.created_at, us.updated_at,
                       u.username as created_by_name
                FROM upload_servers us
                LEFT JOIN users u ON us.created_by = u.id
            """
            if not include_inactive:
                query += " WHERE us.is_active = TRUE"
            query += " ORDER BY us.name"

            cursor.execute(query)
            return cursor.fetchall()
        except Exception as e:
            logger.error(f"Error fetching upload servers: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def update_server(self, server_id: int, data: Dict[str, Any]) -> bool:
        """Update an upload server."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()

            update_fields = []
            values = []

            allowed_fields = [
                'name', 'ip_address', 'port', 'protocol', 'username',
                'base_path', 'version_file_path', 'is_active', 'metadata'
            ]

            for field in allowed_fields:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    values.append(data[field])

            if data.get('password'):
                update_fields.append("password = %s")
                values.append(data['password'])

            if data.get('ssh_key'):
                update_fields.append("ssh_key = %s")
                values.append(data['ssh_key'])

            if not update_fields:
                return True

            values.append(server_id)
            query = f"UPDATE upload_servers SET {', '.join(update_fields)} WHERE id = %s"

            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Error updating upload server: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()

    def delete_server(self, server_id: int) -> bool:
        """Delete an upload server."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM upload_servers WHERE id = %s", (server_id,))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Error deleting upload server: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()


class GuestOSUploadRepository:
    """Repository for guest OS upload operations."""

    def __init__(self):
        self.db = DatabaseManager()

    def create_upload(self, data: Dict[str, Any]) -> Optional[int]:
        """Create a new upload record."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO guest_os_uploads
                (server_id, image_name, file_name, file_path, file_size, file_type,
                 version, checksum, changelog, status, uploaded_by, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                data.get('server_id'),
                data.get('image_name'),
                data.get('file_name'),
                data.get('file_path'),
                data.get('file_size'),
                data.get('file_type'),
                data.get('version'),
                data.get('checksum'),
                data.get('changelog'),
                data.get('status', 'uploading'),
                data.get('uploaded_by'),
                data.get('metadata')
            ))
            conn.commit()
            return cursor.fetchone()[0]
        except Exception as e:
            logger.error(f"Error creating upload record: {e}")
            conn.rollback()
            return None
        finally:
            cursor.close()
            conn.close()

    def get_upload_by_id(self, upload_id: int) -> Optional[Dict[str, Any]]:
        """Get an upload record by ID."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT gu.*, us.name as server_name, u.username as uploaded_by_name
                FROM guest_os_uploads gu
                LEFT JOIN upload_servers us ON gu.server_id = us.id
                LEFT JOIN users u ON gu.uploaded_by = u.id
                WHERE gu.id = %s
            """, (upload_id,))
            return cursor.fetchone()
        except Exception as e:
            logger.error(f"Error fetching upload record: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_uploads_by_server(self, server_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Get upload history for a server."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT gu.*, u.username as uploaded_by_name
                FROM guest_os_uploads gu
                LEFT JOIN users u ON gu.uploaded_by = u.id
                WHERE gu.server_id = %s
                ORDER BY gu.uploaded_at DESC
                LIMIT %s
            """, (server_id, limit))
            return cursor.fetchall()
        except Exception as e:
            logger.error(f"Error fetching uploads for server: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def get_uploads_by_image(self, server_id: int, image_name: str) -> List[Dict[str, Any]]:
        """Get upload history for a specific image on a server."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT gu.*, u.username as uploaded_by_name
                FROM guest_os_uploads gu
                LEFT JOIN users u ON gu.uploaded_by = u.id
                WHERE gu.server_id = %s AND gu.image_name = %s
                ORDER BY gu.uploaded_at DESC
            """, (server_id, image_name))
            return cursor.fetchall()
        except Exception as e:
            logger.error(f"Error fetching uploads for image: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def update_upload_status(self, upload_id: int, status: str,
                            error_message: str = None) -> bool:
        """Update upload status."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            if status == 'completed':
                cursor.execute("""
                    UPDATE guest_os_uploads
                    SET status = %s, completed_at = NOW()
                    WHERE id = %s
                """, (status, upload_id))
            elif status == 'failed':
                cursor.execute("""
                    UPDATE guest_os_uploads
                    SET status = %s, error_message = %s, completed_at = NOW()
                    WHERE id = %s
                """, (status, error_message, upload_id))
            else:
                cursor.execute("""
                    UPDATE guest_os_uploads SET status = %s WHERE id = %s
                """, (status, upload_id))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Error updating upload status: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()

    def update_upload_checksum(self, upload_id: int, checksum: str) -> bool:
        """Update upload checksum after completion."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE guest_os_uploads SET checksum = %s WHERE id = %s
            """, (checksum, upload_id))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Error updating upload checksum: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()

    def delete_upload(self, upload_id: int) -> bool:
        """Delete an upload record."""
        conn = self.db.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM guest_os_uploads WHERE id = %s", (upload_id,))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Error deleting upload record: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()
            conn.close()
