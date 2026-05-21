import paramiko
import threading
import uuid
import queue
import os
import socket
from typing import Dict, Any, Optional, List
from loguru import logger

from database import UserDatabase
from models.ssh import SSHConnectionInfo, SSHSessionStatus, SSHCommandRequest, SSHCommandResponse, SSHConnectRequest
from utils.helpers import clean_terminal_output


class SSHSession:
    
    def __init__(self, session_id: str, host: str, port: int, username: str, 
                 password: Optional[str] = None, key_path: Optional[str] = None):
        self.session_id = session_id
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.key_path = key_path
        self.client = None
        self.shell = None
        self.output_queue = queue.Queue()
        self.connected = False
        
    def connect(self) -> bool:
        """
        Establish SSH connection.
        
        Returns:
            bool: True if connection successful
        """
        logger.debug(f"Attempting SSH connection to {self.username}@{self.host}:{self.port}")
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Configure connection parameters for stability
            connect_kwargs = {
                'hostname': self.host,
                'port': self.port,
                'username': self.username,
                'timeout': 10,
                'banner_timeout': 30,
                'auth_timeout': 30
            }
            
            if self.key_path and os.path.exists(self.key_path):
                # Use SSH key authentication
                connect_kwargs['key_filename'] = self.key_path
                self.client.connect(**connect_kwargs)
            elif self.password:
                # Use password authentication
                connect_kwargs['password'] = self.password
                self.client.connect(**connect_kwargs)
            else:
                raise Exception("No authentication method provided")
            
            # Create interactive shell
            self.shell = self.client.invoke_shell()
            # Set a reasonable timeout for shell operations
            self.shell.settimeout(1.0)
            self.connected = True
            
            # Start output reader thread
            threading.Thread(target=self._read_output, daemon=True).start()
            
            # Give a moment for initial output (like welcome message)
            import time
            time.sleep(0.5)
            
            # Capture initial output
            initial_output = self.get_output()
            if initial_output:
                logger.debug(f"SSH initial output from {self.host}: {initial_output[:200]}...")
            
            logger.debug(f"SSH connection established successfully to {self.host}")
            return True
        except Exception as e:
            logger.error(f"SSH connection failed: {e}")
            return False
    
    def _read_output(self):
        """Read output from SSH shell in background thread."""
        import time
        logger.debug(f"Starting SSH output reader thread for {self.host}")
        while self.connected and self.shell:
            try:
                if self.shell.recv_ready():
                    raw_output = self.shell.recv(4096).decode('utf-8', errors='ignore')
                    # Clean ANSI escape sequences and control characters
                    cleaned_output = clean_terminal_output(raw_output)
                    self.output_queue.put(cleaned_output)
                    logger.debug(f"SSH output received from {self.host}: {len(raw_output)} chars -> {len(cleaned_output)} chars cleaned")
                else:
                    # Sleep briefly to prevent tight loop and reduce CPU usage
                    time.sleep(0.1)
            except socket.timeout:
                # Timeout is expected, continue reading
                continue
            except Exception as e:
                if self.connected:
                    logger.error(f"Error reading SSH output from {self.host}: {e}")
                break
        logger.debug(f"SSH output reader thread exiting for {self.host}")
    
    def execute_command(self, command: str) -> bool:
        """
        Execute command in SSH shell.
        
        Args:
            command: Command to execute
            
        Returns:
            bool: True if command sent successfully
        """
        if not self.connected or not self.shell:
            return False
        try:
            self.shell.send(command + '\n')
            return True
        except Exception as e:
            logger.error(f"Error executing SSH command: {e}")
            return False
    
    def get_output(self) -> str:
        """
        Get accumulated output from SSH session.
        
        Returns:
            str: Output from SSH session
        """
        output_lines = []
        try:
            while not self.output_queue.empty():
                output_lines.append(self.output_queue.get_nowait())
        except queue.Empty:
            pass
        return ''.join(output_lines)
    
    def disconnect(self):
        """
        Close SSH connection and cleanup resources.
        """
        logger.debug(f"Disconnecting SSH session to {self.host}")
        self.connected = False
        if self.shell:
            self.shell.close()
            self.shell = None
        if self.client:
            self.client.close()
            self.client = None
        logger.debug(f"SSH session to {self.host} disconnected")
    
    def is_alive(self) -> bool:
        """
        Check if SSH connection is still alive.
        
        Returns:
            bool: True if connection is active
        """
        if not self.connected or not self.client:
            logger.debug(f"SSH session {self.session_id} not connected or no client")
            return False
        
        try:
            # Check transport status
            transport = self.client.get_transport()
            if transport is None:
                logger.debug(f"SSH session {self.session_id} has no transport")
                return False
            
            is_active = transport.is_active()
            logger.debug(f"SSH session {self.session_id} transport active: {is_active}")
            return is_active
        except Exception as e:
            logger.debug(f"SSH session {self.session_id} is_alive check failed: {e}")
            return False


class SSHService:
    
    def __init__(self, db: UserDatabase):
        self.db = db
        self.ssh_sessions: Dict[str, SSHSession] = {}
        self.ssh_session_outputs: Dict[str, str] = {}
        self._sessions_lock = threading.RLock()
    
    def create_ssh_connection(self, server_id: str, ssh_config: Dict[str, Any], 
                            admin_username: str, ip_address: Optional[str] = None) -> Dict[str, Any]:
        try:
            logger.info(f"SSH connection requested for server {ssh_config}")
            
            # Extract server IP from server_id
            server_ip = server_id.replace('server-', '').replace('-', '.')
            
            # Create SSH session
            session_id = str(uuid.uuid4())
            ssh_session = SSHSession(
                session_id=session_id,
                host=ssh_config.get('host', server_ip),
                port=int(ssh_config.get('port', 22)),
                username=ssh_config.get('username', 'root'),
                password=ssh_config.get('password'),
                key_path=ssh_config.get('key_path')
            )
            
            if ssh_session.connect():
                with self._sessions_lock:
                    self.ssh_sessions[session_id] = ssh_session

                # Log SSH connection
                self.db.log_audit_event(
                    username=admin_username,
                    action_type='ssh_connect',
                    action_details={
                        'message': f'SSH connection established to server {server_ip}',
                        'server_id': server_id,
                        'server_ip': server_ip,
                        'ssh_user': ssh_config.get('username', 'root')
                    },
                    ip_address=ip_address
                )
                
                return {
                    'success': True,
                    'session_id': session_id,
                    'message': f'SSH connection established to {server_ip}'
                }
            else:
                return {
                    'success': False,
                    'error': 'Failed to establish SSH connection'
                }
                
        except Exception as e:
            logger.error(f"Error creating SSH connection: {e}")
            return {'success': False, 'error': 'Failed to create SSH connection'}
    
    def execute_ssh_command(self, session_id: str, command: str, admin_username: str,
                          ip_address: Optional[str] = None) -> Dict[str, Any]:
        try:
            with self._sessions_lock:
                if session_id not in self.ssh_sessions:
                    return {'success': False, 'error': 'SSH session not found'}
                ssh_session = self.ssh_sessions[session_id]

            if ssh_session.execute_command(command):
                # Log command execution
                self.db.log_audit_event(
                    username=admin_username,
                    action_type='ssh_command',
                    action_details={
                        'message': f'SSH command executed: {command}',
                        'command': command,
                        'session_id': session_id,
                        'server_ip': ssh_session.host
                    },
                    ip_address=ip_address
                )
                
                return {
                    'success': True,
                    'message': 'Command executed'
                }
            else:
                return {'success': False, 'error': 'Failed to execute command'}
                
        except Exception as e:
            logger.error(f"Error executing SSH command: {e}")
            return {'success': False, 'error': 'Failed to execute command'}
    
    def get_ssh_output(self, session_id: str) -> Dict[str, Any]:
        try:
            with self._sessions_lock:
                if session_id not in self.ssh_sessions:
                    return {'success': False, 'error': 'SSH session not found'}
                ssh_session = self.ssh_sessions[session_id]

            output = ssh_session.get_output()

            with self._sessions_lock:
                if session_id not in self.ssh_session_outputs:
                    self.ssh_session_outputs[session_id] = ""
                self.ssh_session_outputs[session_id] += output
                full_output = self.ssh_session_outputs[session_id]

            # Check if session is still alive (blocking I/O — outside the lock)
            is_connected = ssh_session.is_alive()

            return {
                'success': True,
                'output': output,
                'full_output': full_output,
                'connected': is_connected
            }

        except Exception as e:
            logger.error(f"Error getting SSH output: {e}")
            return {
                'success': False,
                'error': 'Failed to get SSH output',
                'connected': False
            }
    
    def get_ssh_session_status(self, session_id: str) -> Dict[str, Any]:
        try:
            with self._sessions_lock:
                if session_id not in self.ssh_sessions:
                    return {
                        'success': False,
                        'connected': False,
                        'error': 'SSH session not found'
                    }
                ssh_session = self.ssh_sessions[session_id]

            # is_alive does blocking I/O — outside the lock
            is_alive = ssh_session.is_alive()

            if not is_alive:
                # Clean up dead session
                logger.warning(f"SSH session {session_id} is dead, cleaning up")
                with self._sessions_lock:
                    self.ssh_sessions.pop(session_id, None)
                    self.ssh_session_outputs.pop(session_id, None)

            return {
                'success': True,
                'connected': is_alive,
                'session_id': session_id
            }

        except Exception as e:
            logger.error(f"Error checking SSH session status: {e}")
            return {
                'success': False,
                'connected': False,
                'error': 'Failed to check session status'
            }
    
    def disconnect_ssh_session(self, session_id: str, admin_username: str,
                             ip_address: Optional[str] = None) -> Dict[str, Any]:
        try:
            with self._sessions_lock:
                if session_id not in self.ssh_sessions:
                    return {'success': False, 'error': 'SSH session not found'}
                ssh_session = self.ssh_sessions[session_id]
                server_ip = ssh_session.host

            # Disconnect does blocking I/O — outside the lock
            ssh_session.disconnect()

            with self._sessions_lock:
                self.ssh_sessions.pop(session_id, None)
                self.ssh_session_outputs.pop(session_id, None)

            # Log SSH disconnection
            self.db.log_audit_event(
                username=admin_username,
                action_type='ssh_disconnect',
                action_details={
                    'message': f'SSH session disconnected from server {server_ip}',
                    'session_id': session_id,
                    'server_ip': server_ip
                },
                ip_address=ip_address
            )
            
            return {
                'success': True,
                'message': f'SSH session disconnected from {server_ip}'
            }
            
        except Exception as e:
            logger.error(f"Error disconnecting SSH session: {e}")
            return {'success': False, 'error': 'Failed to disconnect SSH session'}
    
    def get_ssh_sessions(self) -> List[Dict[str, Any]]:
        try:
            with self._sessions_lock:
                snapshot = list(self.ssh_sessions.items())
            sessions = []
            for session_id, ssh_session in snapshot:
                sessions.append({
                    'session_id': session_id,
                    'host': ssh_session.host,
                    'port': ssh_session.port,
                    'username': ssh_session.username,
                    'connected': ssh_session.connected
                })
            return sessions
        except Exception as e:
            logger.error(f"Error getting SSH sessions: {e}")
            return []
