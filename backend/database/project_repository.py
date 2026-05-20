"""Repository for build project operations."""

import json
import psycopg2
from typing import Dict, List, Optional, Any
from .base import DatabaseManager


class ProjectRepository:
    """Repository for managing build projects."""

    def __init__(self):
        self.db_manager = DatabaseManager()

    def create_project(self, project_data: Dict[str, Any]) -> Optional[int]:
        """
        Create a new build project.

        Returns:
            The ID of the created project, or None if creation failed
        """
        query = """
        INSERT INTO build_projects
        (name, description, repo_url, repo_branch, dockerfile_path, build_context,
         git_pat, default_registry_id, image_name, auto_increment_tag, last_tag,
         is_active, metadata, created_by)
        VALUES (%(name)s, %(description)s, %(repo_url)s, %(repo_branch)s, %(dockerfile_path)s,
                %(build_context)s, %(git_pat)s, %(default_registry_id)s, %(image_name)s,
                %(auto_increment_tag)s, %(last_tag)s, %(is_active)s, %(metadata)s, %(created_by)s)
        RETURNING id
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            metadata = project_data.get('metadata', {})
            cursor.execute(query, {
                'name': project_data['name'],
                'description': project_data.get('description'),
                'repo_url': project_data['repo_url'],
                'repo_branch': project_data.get('repo_branch', 'main'),
                'dockerfile_path': project_data.get('dockerfile_path', 'Dockerfile'),
                'build_context': project_data.get('build_context', '.'),
                'git_pat': project_data.get('git_pat'),
                'default_registry_id': project_data.get('default_registry_id'),
                'image_name': project_data.get('image_name'),
                'auto_increment_tag': project_data.get('auto_increment_tag', True),
                'last_tag': project_data.get('last_tag'),
                'is_active': project_data.get('is_active', True),
                'metadata': json.dumps(metadata) if metadata else None,
                'created_by': project_data.get('created_by')
            })
            conn.commit()
            return cursor.fetchone()[0]
        except psycopg2.Error as e:
            print(f"Error creating project: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_project_by_id(self, project_id: int) -> Optional[Dict[str, Any]]:
        """Get a project by its ID."""
        query = """
        SELECT p.*, r.name as registry_name, r.url as registry_url
        FROM build_projects p
        LEFT JOIN registry_servers r ON p.default_registry_id = r.id
        WHERE p.id = %s
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (project_id,))
            result = cursor.fetchone()
            if result:
                if result.get('metadata'):
                    try:
                        result['metadata'] = json.loads(result['metadata'])
                    except (json.JSONDecodeError, TypeError):
                        result['metadata'] = {}
                result['git_pat'] = '***' if result.get('git_pat') else None
            return result
        except psycopg2.Error as e:
            print(f"Error fetching project: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_project_with_credentials(self, project_id: int) -> Optional[Dict[str, Any]]:
        """Get a project by its ID including credentials (for internal use only)."""
        query = """
        SELECT p.*, r.name as registry_name, r.url as registry_url,
               r.username as registry_username, r.password as registry_password
        FROM build_projects p
        LEFT JOIN registry_servers r ON p.default_registry_id = r.id
        WHERE p.id = %s
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (project_id,))
            result = cursor.fetchone()
            if result and result.get('metadata'):
                try:
                    result['metadata'] = json.loads(result['metadata'])
                except (json.JSONDecodeError, TypeError):
                    result['metadata'] = {}
            return result
        except psycopg2.Error as e:
            print(f"Error fetching project with credentials: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_all_projects(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all build projects."""
        if include_inactive:
            query = """
            SELECT p.*, r.name as registry_name, r.url as registry_url,
                   (SELECT COUNT(*) FROM build_history WHERE project_id = p.id) as build_count,
                   (SELECT status FROM build_history WHERE project_id = p.id ORDER BY started_at DESC LIMIT 1) as last_build_status
            FROM build_projects p
            LEFT JOIN registry_servers r ON p.default_registry_id = r.id
            ORDER BY p.name ASC
            """
        else:
            query = """
            SELECT p.*, r.name as registry_name, r.url as registry_url,
                   (SELECT COUNT(*) FROM build_history WHERE project_id = p.id) as build_count,
                   (SELECT status FROM build_history WHERE project_id = p.id ORDER BY started_at DESC LIMIT 1) as last_build_status
            FROM build_projects p
            LEFT JOIN registry_servers r ON p.default_registry_id = r.id
            WHERE p.is_active = TRUE
            ORDER BY p.name ASC
            """

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
                result['git_pat'] = '***' if result.get('git_pat') else None

            return results
        except psycopg2.Error as e:
            print(f"Error fetching projects: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def update_project(self, project_id: int, update_data: Dict[str, Any]) -> bool:
        """Update a build project."""
        allowed_fields = ['name', 'description', 'repo_url', 'repo_branch', 'dockerfile_path',
                         'build_context', 'git_pat', 'default_registry_id', 'image_name',
                         'auto_increment_tag', 'last_tag', 'is_active', 'metadata']
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

        values.append(project_id)
        query = f"UPDATE build_projects SET {', '.join(update_fields)} WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error updating project: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def delete_project(self, project_id: int) -> bool:
        """Delete a build project."""
        query = "DELETE FROM build_projects WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (project_id,))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error deleting project: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def update_last_tag(self, project_id: int, tag: str) -> bool:
        """Update the last used tag for a project."""
        query = "UPDATE build_projects SET last_tag = %s WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (tag, project_id))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error updating last tag: {e}")
            return False
        finally:
            cursor.close()
            conn.close()


class BuildHistoryRepository:
    """Repository for managing build history."""

    def __init__(self):
        self.db_manager = DatabaseManager()

    def create_build(self, build_data: Dict[str, Any]) -> Optional[int]:
        """Create a new build record."""
        query = """
        INSERT INTO build_history
        (project_id, registry_id, tag, status, git_commit, triggered_by, metadata)
        VALUES (%(project_id)s, %(registry_id)s, %(tag)s, %(status)s,
                %(git_commit)s, %(triggered_by)s, %(metadata)s)
        RETURNING id
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            metadata = build_data.get('metadata', {})
            cursor.execute(query, {
                'project_id': build_data['project_id'],
                'registry_id': build_data.get('registry_id'),
                'tag': build_data['tag'],
                'status': build_data.get('status', 'pending'),
                'git_commit': build_data.get('git_commit'),
                'triggered_by': build_data.get('triggered_by'),
                'metadata': json.dumps(metadata) if metadata else None
            })
            conn.commit()
            return cursor.fetchone()[0]
        except psycopg2.Error as e:
            print(f"Error creating build: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_build_by_id(self, build_id: int) -> Optional[Dict[str, Any]]:
        """Get a build by its ID."""
        query = """
        SELECT bh.*, p.name as project_name, r.name as registry_name
        FROM build_history bh
        LEFT JOIN build_projects p ON bh.project_id = p.id
        LEFT JOIN registry_servers r ON bh.registry_id = r.id
        WHERE bh.id = %s
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (build_id,))
            result = cursor.fetchone()
            if result and result.get('metadata'):
                try:
                    result['metadata'] = json.loads(result['metadata'])
                except (json.JSONDecodeError, TypeError):
                    result['metadata'] = {}
            return result
        except psycopg2.Error as e:
            print(f"Error fetching build: {e}")
            return None
        finally:
            cursor.close()
            conn.close()

    def get_builds_by_project(self, project_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Get build history for a project."""
        query = """
        SELECT bh.*, r.name as registry_name, u.username as triggered_by_name
        FROM build_history bh
        LEFT JOIN registry_servers r ON bh.registry_id = r.id
        LEFT JOIN users u ON bh.triggered_by = u.id
        WHERE bh.project_id = %s
        ORDER BY bh.started_at DESC
        LIMIT %s
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (project_id, limit))
            results = cursor.fetchall()

            for result in results:
                if result.get('metadata'):
                    try:
                        result['metadata'] = json.loads(result['metadata'])
                    except (json.JSONDecodeError, TypeError):
                        result['metadata'] = {}

            return results
        except psycopg2.Error as e:
            print(f"Error fetching builds: {e}")
            return []
        finally:
            cursor.close()
            conn.close()

    def update_build_status(self, build_id: int, status: str,
                           error_message: str = None,
                           build_logs: str = None) -> bool:
        """Update build status and optionally logs/error."""
        update_fields = ["status = %s"]
        values = [status]

        if error_message is not None:
            update_fields.append("error_message = %s")
            values.append(error_message)

        if build_logs is not None:
            update_fields.append("build_logs = %s")
            values.append(build_logs)

        if status in ('completed', 'failed'):
            update_fields.append("completed_at = NOW()")
            update_fields.append(
                "duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT"
            )

        values.append(build_id)
        query = f"UPDATE build_history SET {', '.join(update_fields)} WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error updating build status: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def append_build_log(self, build_id: int, log_line: str) -> bool:
        """Append a line to build logs."""
        query = """
        UPDATE build_history
        SET build_logs = COALESCE(build_logs, '') || %s
        WHERE id = %s
        """

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (log_line + '\n', build_id))
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error appending build log: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def set_build_result(self, build_id: int, image_digest: str = None,
                        image_size: int = None) -> bool:
        """Set build result details."""
        update_fields = []
        values = []

        if image_digest:
            update_fields.append("image_digest = %s")
            values.append(image_digest)

        if image_size:
            update_fields.append("image_size = %s")
            values.append(image_size)

        if not update_fields:
            return False

        values.append(build_id)
        query = f"UPDATE build_history SET {', '.join(update_fields)} WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0
        except psycopg2.Error as e:
            print(f"Error setting build result: {e}")
            return False
        finally:
            cursor.close()
            conn.close()

    def get_build_logs(self, build_id: int) -> Optional[str]:
        """Get build logs for a specific build."""
        query = "SELECT build_logs FROM build_history WHERE id = %s"

        conn = self.db_manager.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, (build_id,))
            result = cursor.fetchone()
            return result[0] if result else None
        except psycopg2.Error as e:
            print(f"Error fetching build logs: {e}")
            return None
        finally:
            cursor.close()
            conn.close()
