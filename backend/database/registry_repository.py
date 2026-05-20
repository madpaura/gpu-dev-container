"""Repository for Docker registry server operations."""

import json
import psycopg2
from typing import Dict, List, Optional, Any
from .base import DatabaseManager


class RegistryRepository:
    """Repository for managing Docker registry servers."""

    def __init__(self):
        self.db_manager = DatabaseManager()

    def create_registry(self, registry_data: Dict[str, Any]) -> Optional[int]:
        """
        Create a new registry server.

        Returns:
            The ID of the created registry, or None if creation failed
        """
        query = """
        INSERT INTO registry_servers
        (name, url, registry_type, username, password, is_default, is_active, metadata, created_by)
        VALUES (%(name)s, %(url)s, %(registry_type)s, %(username)s, %(password)s,
                %(is_default)s, %(is_active)s, %(metadata)s, %(created_by)s)
        RETURNING id
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()

            if registry_data.get('is_default', False):
                cursor.execute("UPDATE registry_servers SET is_default = FALSE")

            metadata = registry_data.get('metadata', {})
            cursor.execute(query, {
                'name': registry_data['name'],
                'url': registry_data['url'],
                'registry_type': registry_data.get('registry_type', 'private'),
                'username': registry_data.get('username'),
                'password': registry_data.get('password'),
                'is_default': registry_data.get('is_default', False),
                'is_active': registry_data.get('is_active', True),
                'metadata': json.dumps(metadata) if metadata else None,
                'created_by': registry_data.get('created_by')
            })
            conn.commit()
            return cursor.fetchone()[0]
        except psycopg2.Error as e:
            print(f"Error creating registry: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_registry_by_id(self, registry_id: int) -> Optional[Dict[str, Any]]:
        """Get a registry by its ID."""
        query = "SELECT * FROM registry_servers WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (registry_id,))
            result = cursor.fetchone()
            if result and result.get('metadata'):
                try:
                    result['metadata'] = json.loads(result['metadata'])
                except (json.JSONDecodeError, TypeError):
                    result['metadata'] = {}
            return result
        except psycopg2.Error as e:
            print(f"Error fetching registry: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_all_registries(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all registry servers."""
        if include_inactive:
            query = "SELECT * FROM registry_servers ORDER BY is_default DESC, name ASC"
        else:
            query = "SELECT * FROM registry_servers WHERE is_active = TRUE ORDER BY is_default DESC, name ASC"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            results = cursor.fetchall()

            for result in results:
                if result.get('metadata'):
                    try:
                        result['metadata'] = json.loads(result['metadata'])
                    except (json.JSONDecodeError, TypeError):
                        result['metadata'] = {}
                result['password'] = '***' if result.get('password') else None

            return results
        except psycopg2.Error as e:
            print(f"Error fetching registries: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def update_registry(self, registry_id: int, update_data: Dict[str, Any]) -> bool:
        """Update a registry server."""
        allowed_fields = ['name', 'url', 'registry_type', 'username', 'password',
                         'is_default', 'is_active', 'metadata']
        update_fields = []
        values = []

        for field in allowed_fields:
            if field in update_data:
                if field == 'metadata':
                    update_fields.append(f"{field} = %s")
                    values.append(json.dumps(update_data[field]))
                else:
                    update_fields.append(f"{field} = %s")
                    values.append(update_data[field])

        if not update_fields:
            return False

        values.append(registry_id)
        query = f"UPDATE registry_servers SET {', '.join(update_fields)} WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()

            if update_data.get('is_default', False):
                cursor.execute("UPDATE registry_servers SET is_default = FALSE WHERE id != %s", (registry_id,))

            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error updating registry: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def delete_registry(self, registry_id: int) -> bool:
        """Delete a registry server."""
        query = "DELETE FROM registry_servers WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (registry_id,))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error deleting registry: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def get_default_registry(self) -> Optional[Dict[str, Any]]:
        """Get the default registry server."""
        query = "SELECT * FROM registry_servers WHERE is_default = TRUE AND is_active = TRUE LIMIT 1"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query)
            result = cursor.fetchone()
            if result and result.get('metadata'):
                try:
                    result['metadata'] = json.loads(result['metadata'])
                except (json.JSONDecodeError, TypeError):
                    result['metadata'] = {}
            return result
        except psycopg2.Error as e:
            print(f"Error fetching default registry: {e}")
            return None
        finally:
            cursor.close()
            conn.close()
