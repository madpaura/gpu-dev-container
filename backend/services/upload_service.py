"""Service for managing guest OS uploads and file operations."""

import os
import json
import hashlib
import logging
import re
import tempfile
import subprocess
from datetime import datetime
from typing import Dict, Any, List, Optional
import paramiko
from stat import S_ISDIR, S_ISREG

_SAFE_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_.\-]{1,64}$')
_SAFE_HOST_RE = re.compile(r'^[a-zA-Z0-9_.\-]{1,253}$')

from database.upload_repository import UploadServerRepository, GuestOSUploadRepository
from database import UserDatabase

logger = logging.getLogger(__name__)


class UploadService:
    """Service for managing upload servers and guest OS uploads."""
    
    def __init__(self):
        self.server_repo = UploadServerRepository()
        self.upload_repo = GuestOSUploadRepository()
        self.db = UserDatabase()
    
    # ==================== Server Management ====================
    
    def create_server(self, data: Dict[str, Any], 
                     admin_username: str = "Admin",
                     user_id: int = None,
                     ip_address: str = None) -> Dict[str, Any]:
        """Create a new upload server."""
        try:
            server_id = self.server_repo.create_server(data, created_by=user_id)
            if server_id:
                self.db.log_audit_event(
                    admin_username,
                    'create_upload_server',
                    {
                        'message': f'{admin_username} created upload server {data.get("name")}',
                        'server_id': server_id
                    },
                    ip_address
                )
                return {'success': True, 'server_id': server_id}
            return {'success': False, 'error': 'Failed to create server'}
        except Exception as e:
            logger.error(f"Error creating upload server: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_server(self, server_id: int) -> Dict[str, Any]:
        """Get an upload server by ID."""
        try:
            server = self.server_repo.get_server_by_id(server_id)
            if server:
                return {'success': True, 'data': server}
            return {'success': False, 'error': 'Server not found'}
        except Exception as e:
            logger.error(f"Error fetching upload server: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_all_servers(self, include_inactive: bool = False) -> Dict[str, Any]:
        """Get all upload servers."""
        try:
            servers = self.server_repo.get_all_servers(include_inactive)
            return {'success': True, 'servers': servers}
        except Exception as e:
            logger.error(f"Error fetching upload servers: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_server(self, server_id: int, data: Dict[str, Any],
                     admin_username: str = "Admin",
                     ip_address: str = None) -> Dict[str, Any]:
        """Update an upload server."""
        try:
            if self.server_repo.update_server(server_id, data):
                self.db.log_audit_event(
                    admin_username,
                    'update_upload_server',
                    {
                        'message': f'{admin_username} updated upload server {server_id}',
                        'server_id': server_id
                    },
                    ip_address
                )
                return {'success': True, 'message': 'Server updated'}
            return {'success': False, 'error': 'Failed to update server'}
        except Exception as e:
            logger.error(f"Error updating upload server: {e}")
            return {'success': False, 'error': str(e)}
    
    def delete_server(self, server_id: int,
                     admin_username: str = "Admin",
                     ip_address: str = None) -> Dict[str, Any]:
        """Delete an upload server."""
        try:
            server = self.server_repo.get_server_by_id(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            if self.server_repo.delete_server(server_id):
                self.db.log_audit_event(
                    admin_username,
                    'delete_upload_server',
                    {
                        'message': f'{admin_username} deleted upload server {server.get("name")}',
                        'server_id': server_id
                    },
                    ip_address
                )
                return {'success': True, 'message': 'Server deleted'}
            return {'success': False, 'error': 'Failed to delete server'}
        except Exception as e:
            logger.error(f"Error deleting upload server: {e}")
            return {'success': False, 'error': str(e)}
    
    def test_connection(self, server_id: int) -> Dict[str, Any]:
        """Test connection to an upload server."""
        try:
            server = self.server_repo.get_server_with_credentials(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            if server['protocol'] == 'local':
                # Test local path
                if os.path.exists(server['base_path']):
                    return {'success': True, 'message': 'Local path accessible'}
                return {'success': False, 'error': 'Local path not found'}
            
            # Test SFTP/SCP connection
            result = self._test_sftp_connection(server)
            return result
            
        except Exception as e:
            logger.error(f"Error testing connection: {e}")
            return {'success': False, 'error': str(e)}
    
    def _test_sftp_connection(self, server: Dict[str, Any]) -> Dict[str, Any]:
        """Test SFTP connection to server."""
        ssh = None
        sftp = None
        key_file = None
        try:
            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            connect_kwargs = {
                'hostname': server['ip_address'],
                'port': server.get('port', 22),
                'username': server.get('username'),
                'timeout': 10
            }

            if server.get('ssh_key'):
                key_file = tempfile.NamedTemporaryFile(mode='w', delete=False)
                key_file.write(server['ssh_key'])
                key_file.close()
                connect_kwargs['key_filename'] = key_file.name
            elif server.get('password'):
                connect_kwargs['password'] = server['password']

            ssh.connect(**connect_kwargs)
            sftp = ssh.open_sftp()

            # Check if base path exists
            try:
                sftp.stat(server['base_path'])
            except FileNotFoundError:
                return {'success': False, 'error': f"Base path not found: {server['base_path']}"}

            return {'success': True, 'message': 'Connection successful'}

        except paramiko.AuthenticationException:
            return {'success': False, 'error': 'Authentication failed'}
        except paramiko.SSHException as e:
            return {'success': False, 'error': f'SSH error: {str(e)}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if sftp:
                sftp.close()
            if ssh:
                ssh.close()
            if key_file and os.path.exists(key_file.name):
                os.unlink(key_file.name)
    
    # ==================== File Operations ====================
    
    def browse_files(self, server_id: int, path: str = None) -> Dict[str, Any]:
        """Browse files and folders on an upload server."""
        try:
            server = self.server_repo.get_server_with_credentials(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            base_path = server['base_path']
            browse_path = os.path.join(base_path, path) if path else base_path
            
            if server['protocol'] == 'local':
                return self._browse_local(browse_path, base_path)
            else:
                return self._browse_sftp(server, browse_path, base_path)
                
        except Exception as e:
            logger.error(f"Error browsing files: {e}")
            return {'success': False, 'error': str(e)}
    
    def _browse_local(self, browse_path: str, base_path: str) -> Dict[str, Any]:
        """Browse local filesystem."""
        try:
            if not os.path.exists(browse_path):
                return {'success': False, 'error': 'Path not found'}
            
            # Security check - ensure path is within base_path
            real_browse = os.path.realpath(browse_path)
            real_base = os.path.realpath(base_path)
            if not real_browse.startswith(real_base):
                return {'success': False, 'error': 'Access denied'}
            
            items = []
            for name in os.listdir(browse_path):
                full_path = os.path.join(browse_path, name)
                stat = os.stat(full_path)
                items.append({
                    'name': name,
                    'type': 'directory' if os.path.isdir(full_path) else 'file',
                    'size': stat.st_size if os.path.isfile(full_path) else None,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
            
            # Sort: directories first, then files
            items.sort(key=lambda x: (0 if x['type'] == 'directory' else 1, x['name'].lower()))
            
            relative_path = os.path.relpath(browse_path, base_path)
            if relative_path == '.':
                relative_path = ''
            
            return {
                'success': True,
                'path': relative_path,
                'items': items
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _browse_sftp(self, server: Dict[str, Any], browse_path: str,
                    base_path: str) -> Dict[str, Any]:
        """Browse files via SFTP."""
        # Containment check — normalise without resolving symlinks on remote
        norm_browse = os.path.normpath(browse_path)
        norm_base = os.path.normpath(base_path)
        if not norm_browse.startswith(norm_base + '/') and norm_browse != norm_base:
            return {'success': False, 'error': 'Access denied'}

        ssh = None
        sftp = None
        try:
            ssh = self._get_ssh_connection(server)
            sftp = ssh.open_sftp()

            items = []
            for attr in sftp.listdir_attr(browse_path):
                items.append({
                    'name': attr.filename,
                    'type': 'directory' if S_ISDIR(attr.st_mode) else 'file',
                    'size': attr.st_size if S_ISREG(attr.st_mode) else None,
                    'modified': datetime.fromtimestamp(attr.st_mtime).isoformat()
                })
            
            # Sort: directories first, then files
            items.sort(key=lambda x: (0 if x['type'] == 'directory' else 1, x['name'].lower()))
            
            # Calculate relative path
            if browse_path.startswith(base_path):
                relative_path = browse_path[len(base_path):].lstrip('/')
            else:
                relative_path = ''
            
            return {
                'success': True,
                'path': relative_path,
                'items': items
            }
            
        except FileNotFoundError:
            return {'success': False, 'error': 'Path not found'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if sftp:
                sftp.close()
            if ssh:
                ssh.close()
    
    def delete_file(self, server_id: int, file_path: str,
                   admin_username: str = "Admin",
                   ip_address: str = None) -> Dict[str, Any]:
        """Delete a file or folder on the server."""
        try:
            server = self.server_repo.get_server_with_credentials(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            base_path = server['base_path']
            full_path = os.path.join(base_path, file_path)
            
            if server['protocol'] == 'local':
                result = self._delete_local(full_path, base_path)
            else:
                result = self._delete_sftp(server, full_path)
            
            if result['success']:
                self.db.log_audit_event(
                    admin_username,
                    'delete_file',
                    {
                        'message': f'{admin_username} deleted {file_path} from server {server["name"]}',
                        'server_id': server_id,
                        'file_path': file_path
                    },
                    ip_address
                )
            
            return result
            
        except Exception as e:
            logger.error(f"Error deleting file: {e}")
            return {'success': False, 'error': str(e)}
    
    def _delete_local(self, full_path: str, base_path: str) -> Dict[str, Any]:
        """Delete file/folder from local filesystem."""
        try:
            # Security check
            real_path = os.path.realpath(full_path)
            real_base = os.path.realpath(base_path)
            if not real_path.startswith(real_base) or real_path == real_base:
                return {'success': False, 'error': 'Access denied'}
            
            if os.path.isdir(full_path):
                import shutil
                shutil.rmtree(full_path)
            else:
                os.remove(full_path)
            
            return {'success': True, 'message': 'Deleted successfully'}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _delete_sftp(self, server: Dict[str, Any], full_path: str) -> Dict[str, Any]:
        """Delete file/folder via SFTP."""
        base_path = server.get('base_path', '')
        norm_full = os.path.normpath(full_path)
        norm_base = os.path.normpath(base_path)
        if not norm_full.startswith(norm_base + '/') or norm_full == norm_base:
            return {'success': False, 'error': 'Access denied'}

        ssh = None
        sftp = None
        try:
            ssh = self._get_ssh_connection(server)
            sftp = ssh.open_sftp()

            # Check if it's a directory
            try:
                attr = sftp.stat(full_path)
                if S_ISDIR(attr.st_mode):
                    # Recursively delete directory
                    self._rmdir_recursive(sftp, full_path)
                else:
                    sftp.remove(full_path)
            except FileNotFoundError:
                return {'success': False, 'error': 'File not found'}
            
            return {'success': True, 'message': 'Deleted successfully'}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if sftp:
                sftp.close()
            if ssh:
                ssh.close()
    
    def _rmdir_recursive(self, sftp, path: str):
        """Recursively delete a directory via SFTP."""
        for attr in sftp.listdir_attr(path):
            full_path = os.path.join(path, attr.filename)
            if S_ISDIR(attr.st_mode):
                self._rmdir_recursive(sftp, full_path)
            else:
                sftp.remove(full_path)
        sftp.rmdir(path)
    
    # ==================== Version Management ====================
    
    def get_versions(self, server_id: int) -> Dict[str, Any]:
        """Get version.json content from server."""
        try:
            server = self.server_repo.get_server_with_credentials(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            version_path = server.get('version_file_path')
            if not version_path:
                return {'success': False, 'error': 'Version file path not configured'}
            
            if server['protocol'] == 'local':
                return self._get_local_versions(version_path)
            else:
                return self._get_sftp_versions(server, version_path)
                
        except Exception as e:
            logger.error(f"Error getting versions: {e}")
            return {'success': False, 'error': str(e)}
    
    def _get_local_versions(self, version_path: str) -> Dict[str, Any]:
        """Get versions from local file."""
        try:
            if not os.path.exists(version_path):
                return {'success': True, 'versions': {'last_updated': None, 'images': {}}}
            
            with open(version_path, 'r') as f:
                versions = json.load(f)
            
            return {'success': True, 'versions': versions}
            
        except json.JSONDecodeError:
            return {'success': False, 'error': 'Invalid JSON in version file'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _get_sftp_versions(self, server: Dict[str, Any], 
                          version_path: str) -> Dict[str, Any]:
        """Get versions via SFTP."""
        ssh = None
        sftp = None
        try:
            ssh = self._get_ssh_connection(server)
            sftp = ssh.open_sftp()
            
            try:
                with sftp.open(version_path, 'r') as f:
                    versions = json.load(f)
                return {'success': True, 'versions': versions}
            except FileNotFoundError:
                return {'success': True, 'versions': {'last_updated': None, 'images': {}}}
            except json.JSONDecodeError:
                return {'success': False, 'error': 'Invalid JSON in version file'}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if sftp:
                sftp.close()
            if ssh:
                ssh.close()
    
    def update_version(self, server_id: int, image_name: str, 
                      version: str, changelog: str = None) -> Dict[str, Any]:
        """Update version.json with new image version."""
        try:
            server = self.server_repo.get_server_with_credentials(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            version_path = server.get('version_file_path')
            if not version_path:
                return {'success': False, 'error': 'Version file path not configured'}
            
            # Get current versions
            result = self.get_versions(server_id)
            if not result['success']:
                return result
            
            versions = result['versions']
            
            # Update version info
            versions['last_updated'] = datetime.utcnow().isoformat() + 'Z'
            if 'images' not in versions:
                versions['images'] = {}
            
            versions['images'][image_name] = {
                'version': version,
                'release_date': datetime.utcnow().strftime('%Y-%m-%d'),
                'changelog': changelog or f'Updated to version {version}'
            }
            
            # Save updated versions
            if server['protocol'] == 'local':
                return self._save_local_versions(version_path, versions)
            else:
                return self._save_sftp_versions(server, version_path, versions)
                
        except Exception as e:
            logger.error(f"Error updating version: {e}")
            return {'success': False, 'error': str(e)}
    
    def _save_local_versions(self, version_path: str, 
                            versions: Dict[str, Any]) -> Dict[str, Any]:
        """Save versions to local file."""
        try:
            os.makedirs(os.path.dirname(version_path), exist_ok=True)
            with open(version_path, 'w') as f:
                json.dump(versions, f, indent=2)
            return {'success': True, 'message': 'Version updated'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _save_sftp_versions(self, server: Dict[str, Any], version_path: str,
                           versions: Dict[str, Any]) -> Dict[str, Any]:
        """Save versions via SFTP."""
        ssh = None
        sftp = None
        try:
            ssh = self._get_ssh_connection(server)
            sftp = ssh.open_sftp()
            
            with sftp.open(version_path, 'w') as f:
                json.dump(versions, f, indent=2)
            
            return {'success': True, 'message': 'Version updated'}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            if sftp:
                sftp.close()
            if ssh:
                ssh.close()
    
    def get_next_version(self, server_id: int, image_name: str) -> Dict[str, Any]:
        """Get the next version number for an image."""
        try:
            result = self.get_versions(server_id)
            if not result['success']:
                return result
            
            versions = result['versions']
            images = versions.get('images', {})
            
            if image_name in images:
                current = images[image_name].get('version', '0.0')
                # Parse and increment version
                parts = current.split('.')
                if len(parts) >= 2:
                    try:
                        major = int(parts[0])
                        minor = int(parts[1])
                        next_version = f"{major}.{minor + 1}"
                    except ValueError:
                        next_version = '0.1'
                else:
                    next_version = '0.1'
            else:
                next_version = '0.1'
            
            return {'success': True, 'next_version': next_version}
            
        except Exception as e:
            logger.error(f"Error getting next version: {e}")
            return {'success': False, 'error': str(e)}
    
    # ==================== Upload Operations ====================
    
    def upload_file(self, server_id: int, file_data: bytes, file_name: str,
                   image_name: str, version: str, changelog: str = None,
                   user_id: int = None, admin_username: str = "Admin",
                   ip_address: str = None) -> Dict[str, Any]:
        """Upload a guest OS image file."""
        try:
            server = self.server_repo.get_server_with_credentials(server_id)
            if not server:
                return {'success': False, 'error': 'Server not found'}
            
            # Determine file type
            file_ext = os.path.splitext(file_name)[1].lower()
            allowed_types = ['.qcow2', '.img', '.bin', '.iso', '.raw', '.vmdk']
            if file_ext not in allowed_types:
                return {'success': False, 'error': f'Invalid file type. Allowed: {", ".join(allowed_types)}'}
            
            # Create upload record
            base_path = server['base_path']
            dest_path = os.path.join(base_path, image_name, file_name)
            relative_path = os.path.join(image_name, file_name)
            
            upload_id = self.upload_repo.create_upload({
                'server_id': server_id,
                'image_name': image_name,
                'file_name': file_name,
                'file_path': relative_path,
                'file_size': len(file_data),
                'file_type': file_ext,
                'version': version,
                'changelog': changelog,
                'status': 'uploading',
                'uploaded_by': user_id
            })
            
            if not upload_id:
                return {'success': False, 'error': 'Failed to create upload record'}
            
            # Perform upload
            try:
                logger.info(f"Starting upload to {server['name']} ({server['protocol']}): {dest_path}")
                if server['protocol'] == 'local':
                    result = self._upload_local(dest_path, file_data)
                elif server['protocol'] == 'scp':
                    result = self._upload_scp(server, dest_path, file_data)
                elif server['protocol'] == 'sftp':
                    result = self._upload_sftp(server, dest_path, file_data)
                else:
                    result = {'success': False, 'error': f"Unsupported protocol: {server['protocol']}"}
                
                if result['success']:
                    # Calculate checksum
                    checksum = hashlib.sha256(file_data).hexdigest()
                    self.upload_repo.update_upload_checksum(upload_id, checksum)
                    self.upload_repo.update_upload_status(upload_id, 'completed')
                    
                    # Update version.json
                    self.update_version(server_id, image_name, version, changelog)
                    
                    # Log audit
                    self.db.log_audit_event(
                        admin_username,
                        'upload_guest_os',
                        {
                            'message': f'{admin_username} uploaded {file_name} to {server["name"]}',
                            'server_id': server_id,
                            'image_name': image_name,
                            'version': version,
                            'file_size': len(file_data)
                        },
                        ip_address
                    )
                    
                    return {
                        'success': True,
                        'upload_id': upload_id,
                        'checksum': checksum,
                        'message': 'Upload completed successfully'
                    }
                else:
                    self.upload_repo.update_upload_status(
                        upload_id, 'failed', result.get('error')
                    )
                    return result
                    
            except Exception as e:
                self.upload_repo.update_upload_status(upload_id, 'failed', str(e))
                raise
                
        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return {'success': False, 'error': str(e)}
    
    def _upload_local(self, dest_path: str, file_data: bytes) -> Dict[str, Any]:
        """Upload file to local filesystem."""
        try:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'wb') as f:
                f.write(file_data)
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _upload_scp(self, server: Dict[str, Any], dest_path: str,
                   file_data: bytes) -> Dict[str, Any]:
        """Upload file via native SCP command (much faster than SFTP)."""
        tmp_file = None
        try:
            # Write data to temp file in /home to avoid tmpfs space issues
            tmp_dir = os.path.expanduser('~/.cache/upload_tmp')
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_file = tempfile.NamedTemporaryFile(delete=False, dir=tmp_dir)
            tmp_file.write(file_data)
            tmp_file.close()
            
            host = server['ip_address']
            port = server.get('port', 22)
            username = server.get('username')
            password = server.get('password')

            if not _SAFE_HOST_RE.match(str(host)):
                return {'success': False, 'error': 'Invalid server host'}
            if username and not _SAFE_USERNAME_RE.match(str(username)):
                return {'success': False, 'error': 'Invalid username'}

            # Create remote directory first via SSH
            dir_path = os.path.dirname(dest_path)
            mkdir_cmd = ['ssh', '-o', 'StrictHostKeyChecking=no', '-p', str(port)]
            
            if password:
                mkdir_cmd = ['sshpass', '-p', password] + mkdir_cmd
            
            mkdir_cmd.extend([f'{username}@{host}', f'mkdir -p {dir_path}'])
            
            logger.info(f"Creating remote directory: {dir_path}")
            result = subprocess.run(mkdir_cmd, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                logger.warning(f"mkdir warning: {result.stderr}")
            
            # Build SCP command
            scp_cmd = ['scp', '-o', 'StrictHostKeyChecking=no', '-P', str(port)]
            
            if password:
                # Use sshpass for password auth
                scp_cmd = ['sshpass', '-p', password] + scp_cmd
            
            scp_cmd.extend([tmp_file.name, f'{username}@{host}:{dest_path}'])
            
            logger.info(f"Running native SCP upload: {len(file_data) / (1024*1024):.1f} MB to {host}:{dest_path}")
            
            result = subprocess.run(scp_cmd, capture_output=True, text=True, timeout=600)
            
            if result.returncode == 0:
                logger.info(f"SCP upload completed successfully")
                return {'success': True}
            else:
                error = result.stderr or 'SCP command failed'
                logger.error(f"SCP error: {error}")
                return {'success': False, 'error': error}
                
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'SCP upload timed out'}
        except FileNotFoundError as e:
            if 'sshpass' in str(e):
                return {'success': False, 'error': 'sshpass not installed. Install with: apt install sshpass'}
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"SCP upload error: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if tmp_file and os.path.exists(tmp_file.name):
                os.unlink(tmp_file.name)

    def _upload_sftp(self, server: Dict[str, Any], dest_path: str,
                    file_data: bytes) -> Dict[str, Any]:
        """Upload file via SFTP."""
        ssh = None
        sftp = None
        try:
            logger.info(f"Connecting to {server['ip_address']}:{server.get('port', 22)}")
            ssh = self._get_ssh_connection(server)
            sftp = ssh.open_sftp()
            logger.info(f"SFTP connection established")
            
            # Create directory if needed
            dir_path = os.path.dirname(dest_path)
            logger.info(f"Creating directory: {dir_path}")
            self._mkdir_p(sftp, dir_path)
            
            # Upload file with progress logging
            total_size = len(file_data)
            logger.info(f"Uploading {total_size / (1024*1024):.1f} MB to {dest_path}")
            
            # Write in chunks for better performance and progress tracking
            chunk_size = 1024 * 1024  # 1MB chunks
            with sftp.open(dest_path, 'wb') as f:
                written = 0
                for i in range(0, total_size, chunk_size):
                    chunk = file_data[i:i + chunk_size]
                    f.write(chunk)
                    written += len(chunk)
                    if written % (10 * 1024 * 1024) == 0 or written == total_size:  # Log every 10MB
                        progress = (written / total_size) * 100
                        logger.info(f"Upload progress: {progress:.1f}% ({written / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB)")
            
            logger.info(f"Upload completed successfully")
            return {'success': True}
            
        except Exception as e:
            logger.error(f"SFTP upload error: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            if sftp:
                sftp.close()
            if ssh:
                ssh.close()
    
    def _mkdir_p(self, sftp, remote_path: str):
        """Create directory and parents via SFTP."""
        dirs = []
        while remote_path:
            try:
                sftp.stat(remote_path)
                break
            except FileNotFoundError:
                dirs.append(remote_path)
                remote_path = os.path.dirname(remote_path)
        
        for d in reversed(dirs):
            try:
                sftp.mkdir(d)
            except:
                pass
    
    def get_upload_history(self, server_id: int, limit: int = 50) -> Dict[str, Any]:
        """Get upload history for a server."""
        try:
            uploads = self.upload_repo.get_uploads_by_server(server_id, limit)
            return {'success': True, 'uploads': uploads}
        except Exception as e:
            logger.error(f"Error fetching upload history: {e}")
            return {'success': False, 'error': str(e)}
    
    # ==================== Helper Methods ====================
    
    def _get_ssh_connection(self, server: Dict[str, Any]) -> paramiko.SSHClient:
        """Get SSH connection to server."""
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        connect_kwargs = {
            'hostname': server['ip_address'],
            'port': server.get('port', 22),
            'username': server.get('username'),
            'timeout': 30
        }
        
        if server.get('ssh_key'):
            key_file = tempfile.NamedTemporaryFile(mode='w', delete=False)
            key_file.write(server['ssh_key'])
            key_file.close()
            connect_kwargs['key_filename'] = key_file.name
            ssh.connect(**connect_kwargs)
            os.unlink(key_file.name)
        elif server.get('password'):
            connect_kwargs['password'] = server['password']
            ssh.connect(**connect_kwargs)
        else:
            ssh.connect(**connect_kwargs)
        
        return ssh
