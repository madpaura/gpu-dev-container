import paramiko
import json
import re
from typing import Dict, Any, Optional, List
from loguru import logger

from database import UserDatabase
from models.server import ServerInfo


class CleanupService:
    
    def __init__(self, db: UserDatabase):
        self.db = db
    

    def get_cleanup_summary(self, server_ip: str, username: str, password: str, 
                          ssh_port: int = 22) -> Dict[str, Any]:
        try:
            ssh_client = paramiko.SSHClient()
            ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            ssh_client.connect(
                hostname=server_ip,
                port=ssh_port,
                username=username,
                password=password,
                timeout=10
            )
            
            logger.info(f"Connected to {server_ip} for cleanup summary via SSH")
            
            containers_info = self._get_containers_info_ssh(ssh_client)
            docker_images_info = self._get_docker_images_info_ssh(ssh_client)
            disk_info = self._get_disk_usage_info_ssh(ssh_client)
            
            ssh_client.close()
            
            return {
                'success': True,
                'server_ip': server_ip,
                'containers': containers_info,
                'disk_usage': disk_info,
                'docker_images': docker_images_info,
                'summary': {
                    'total_containers': len(containers_info.get('running', [])) + len(containers_info.get('stopped', [])),
                    'running_containers': len(containers_info.get('running', [])),
                    'stopped_containers': len(containers_info.get('stopped', [])),
                    'total_images': len(docker_images_info.get('images', [])),
                    'total_disk_usage': disk_info.get('total_used_gb', 0)
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting cleanup summary for {server_ip}: {e}")
            return {
                'success': False,
                'error': f'Failed to connect to server: {str(e)}'
            }
    
    def _format_ports(self, ports: dict) -> str:
        if not ports:
            return ''
        
        port_list = []
        for container_port, host_bindings in ports.items():
            if host_bindings:
                for binding in host_bindings:
                    host_port = binding.get('HostPort', '')
                    port_list.append(f"{host_port}:{container_port}")
            else:
                port_list.append(container_port)
        
        return ', '.join(port_list)
    
    def _format_size(self, size_bytes: int) -> str:
        if size_bytes == 0:
            return '0B'
        
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f}{unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f}PB"
    
    def _get_containers_info_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command(
                "docker ps --format 'table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}'"
            )
            running_output = stdout.read().decode('utf-8')
            
            stdin, stdout, stderr = client.exec_command(
                "docker ps -a --filter 'status=exited' --format 'table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}'"
            )
            stopped_output = stdout.read().decode('utf-8')
            
            stdin, stdout, stderr = client.exec_command(
                "docker system df -v --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.SharedSize}}\t{{.UniqueSize}}\t{{.Containers}}'"
            )
            sizes_output = stdout.read().decode('utf-8')
            
            return {
                'running': self._parse_container_output(running_output),
                'stopped': self._parse_container_output(stopped_output),
                'sizes_info': sizes_output.strip()
            }
            
        except Exception as e:
            logger.error(f"Error getting containers info: {e}")
            return {'running': [], 'stopped': [], 'sizes_info': ''}
    
    def _get_disk_usage_info_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            disk_info = {}
            
            stdin, stdout, stderr = client.exec_command("du -sh /opt 2>/dev/null || echo 'N/A'")
            opt_usage = stdout.read().decode('utf-8').strip()
            
            stdin, stdout, stderr = client.exec_command("docker system df")
            docker_df_output = stdout.read().decode('utf-8')
            
            stdin, stdout, stderr = client.exec_command("docker system df -v")
            docker_df_verbose = stdout.read().decode('utf-8')
            
            stdin, stdout, stderr = client.exec_command("df -h /")
            root_disk_usage = stdout.read().decode('utf-8')
            
            stdin, stdout, stderr = client.exec_command("docker info --format '{{.DockerRootDir}}'")
            docker_root = stdout.read().decode('utf-8').strip()
            
            if docker_root:
                stdin, stdout, stderr = client.exec_command(f"du -sh {docker_root} 2>/dev/null || echo 'N/A'")
                docker_root_usage = stdout.read().decode('utf-8').strip()
            else:
                docker_root_usage = 'N/A'
            
            return {
                'opt_usage': opt_usage,
                'docker_system_df': docker_df_output.strip(),
                'docker_system_df_verbose': docker_df_verbose.strip(),
                'root_disk_usage': root_disk_usage.strip(),
                'docker_root_dir': docker_root,
                'docker_root_usage': docker_root_usage,
                'total_used_gb': self._extract_disk_usage_gb(docker_df_output)
            }
            
        except Exception as e:
            logger.error(f"Error getting disk usage info: {e}")
            return {}
    
    def _get_docker_images_info_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command(
                "docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}'"
            )
            images_output = stdout.read().decode('utf-8')
            
            stdin, stdout, stderr = client.exec_command(
                "docker images -f 'dangling=true' --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}'"
            )
            dangling_output = stdout.read().decode('utf-8')
            
            return {
                'images': self._parse_images_output(images_output),
                'dangling_images': self._parse_images_output(dangling_output),
                'raw_output': images_output.strip()
            }
            
        except Exception as e:
            logger.error(f"Error getting Docker images info: {e}")
            return {'images': [], 'dangling_images': [], 'raw_output': ''}
    
    def execute_cleanup(self, server_ip: str, username: str, password: str,
                       cleanup_options: Dict[str, Any], admin_username: str,
                       ssh_port: int = 22, ip_address: Optional[str] = None) -> Dict[str, Any]:
        try:
            logger.info(f"Connecting to {server_ip} for cleanup operations")
            ssh_client = paramiko.SSHClient()
            ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            ssh_client.connect(
                hostname=server_ip,
                port=ssh_port,
                username=username,
                password=password,
                timeout=10
            )
            
            logger.info(f"Executing cleanup operations on {server_ip}")
            results = self._execute_cleanup_ssh(ssh_client, cleanup_options)
            ssh_client.close()
            
            self.db.log_audit_event(
                username=admin_username,
                action_type='server_cleanup',
                action_details={
                    'message': f'Server cleanup executed on {server_ip}',
                    'server_ip': server_ip,
                    'cleanup_options': cleanup_options,
                    'results_count': len(results)
                },
                ip_address=ip_address
            )
            
            return {
                'success': True,
                'server_ip': server_ip,
                'results': results,
                'summary': f'Executed {len(results)} cleanup operations'
            }
            
        except Exception as e:
            logger.error(f"Error executing cleanup on {server_ip}: {e}")
            return {
                'success': False,
                'error': f'Failed to execute cleanup: {str(e)}'
            }
    

    def _execute_cleanup_ssh(self, client: paramiko.SSHClient, cleanup_options: Dict[str, Any]) -> List[Dict[str, Any]]:
        results = []
        
        try:
            if cleanup_options.get('remove_stopped_containers', False):
                result = self._remove_stopped_containers_ssh(client)
                results.append(result)
            
            if cleanup_options.get('remove_dangling_images', False):
                result = self._remove_dangling_images_ssh(client)
                results.append(result)
            
            if cleanup_options.get('remove_unused_volumes', False):
                result = self._remove_unused_volumes_ssh(client)
                results.append(result)
            
            if cleanup_options.get('remove_unused_networks', False):
                result = self._remove_unused_networks_ssh(client)
                results.append(result)
            
            if cleanup_options.get('docker_system_prune', False):
                result = self._docker_system_prune_ssh(client)
                results.append(result)
            
            if cleanup_options.get('remove_specific_containers'):
                container_ids = cleanup_options['remove_specific_containers']
                result = self._remove_specific_containers_ssh(client, container_ids)
                results.append(result)
            
            if cleanup_options.get('remove_specific_images'):
                image_ids = cleanup_options['remove_specific_images']
                result = self._remove_specific_images_ssh(client, image_ids)
                results.append(result)
                
        except Exception as e:
            logger.error(f"Error during SSH cleanup: {e}")
            results.append({
                'operation': 'SSH Cleanup',
                'success': False,
                'error': str(e)
            })
        
        return results
    
    def _remove_stopped_containers_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command("docker container prune -f")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': 'Remove Stopped Containers',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None
            }
        except Exception as e:
            return {
                'operation': 'Remove Stopped Containers',
                'success': False,
                'error': str(e)
            }
    
    def _remove_dangling_images_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command("docker image prune -f")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': 'Remove Dangling Images',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None
            }
        except Exception as e:
            return {
                'operation': 'Remove Dangling Images',
                'success': False,
                'error': str(e)
            }
    
    def _remove_unused_volumes_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command("docker volume prune -f")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': 'Remove Unused Volumes',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None
            }
        except Exception as e:
            return {
                'operation': 'Remove Unused Volumes',
                'success': False,
                'error': str(e)
            }
    
    def _remove_unused_networks_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command("docker network prune -f")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': 'Remove Unused Networks',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None
            }
        except Exception as e:
            return {
                'operation': 'Remove Unused Networks',
                'success': False,
                'error': str(e)
            }
    
    def _docker_system_prune_ssh(self, client: paramiko.SSHClient) -> Dict[str, Any]:
        try:
            stdin, stdout, stderr = client.exec_command("docker system prune -f")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': 'Docker System Prune',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None
            }
        except Exception as e:
            return {
                'operation': 'Docker System Prune',
                'success': False,
                'error': str(e)
            }
    
    @staticmethod
    def _validate_docker_ids(ids: List[str]) -> List[str]:
        """Return only IDs that look like valid Docker container/image IDs or names."""
        valid = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,127}$')
        return [i for i in ids if valid.match(i)]

    def _remove_specific_containers_ssh(self, client: paramiko.SSHClient, container_ids: List[str]) -> Dict[str, Any]:
        try:
            if not container_ids:
                return {
                    'operation': 'Remove Specific Containers',
                    'success': True,
                    'output': 'No containers specified',
                    'error': None
                }

            container_ids = self._validate_docker_ids(container_ids)
            if not container_ids:
                return {'operation': 'Remove Specific Containers', 'success': False,
                        'error': 'No valid container IDs provided'}

            containers_str = ' '.join(container_ids)
            stdin, stdout, stderr = client.exec_command(f"docker stop {containers_str} && docker rm {containers_str}")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': f'Remove Specific Containers ({len(container_ids)} containers)',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None,
                'containers': container_ids
            }
        except Exception as e:
            return {
                'operation': 'Remove Specific Containers',
                'success': False,
                'error': str(e),
                'containers': container_ids
            }
    
    def _remove_specific_images_ssh(self, client: paramiko.SSHClient, image_ids: List[str]) -> Dict[str, Any]:
        try:
            if not image_ids:
                return {
                    'operation': 'Remove Specific Images',
                    'success': True,
                    'output': 'No images specified',
                    'error': None
                }

            image_ids = self._validate_docker_ids(image_ids)
            if not image_ids:
                return {'operation': 'Remove Specific Images', 'success': False,
                        'error': 'No valid image IDs provided'}

            images_str = ' '.join(image_ids)
            stdin, stdout, stderr = client.exec_command(f"docker rmi -f {images_str}")
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            return {
                'operation': f'Remove Specific Images ({len(image_ids)} images)',
                'success': True,
                'output': output.strip(),
                'error': error.strip() if error else None,
                'images': image_ids
            }
        except Exception as e:
            return {
                'operation': 'Remove Specific Images',
                'success': False,
                'error': str(e),
                'images': image_ids
            }
    
    def _parse_container_output(self, output: str) -> List[Dict[str, str]]:
        """Parse Docker container output into structured data."""
        containers = []
        lines = output.strip().split('\n')
        
        # Skip header line if present
        if lines and 'CONTAINER ID' in lines[0]:
            lines = lines[1:]
        
        for line in lines:
            if line.strip():
                parts = line.split('\t')
                if len(parts) >= 7:
                    containers.append({
                        'id': parts[0].strip(),
                        'image': parts[1].strip(),
                        'command': parts[2].strip(),
                        'created': parts[3].strip(),
                        'status': parts[4].strip(),
                        'ports': parts[5].strip(),
                        'names': parts[6].strip()
                    })
        
        return containers
    
    def _parse_images_output(self, output: str) -> List[Dict[str, str]]:
        """Parse Docker images output into structured data."""
        images = []
        lines = output.strip().split('\n')
        
        # Skip header line if present
        if lines and 'REPOSITORY' in lines[0]:
            lines = lines[1:]
        
        for line in lines:
            if line.strip():
                parts = line.split('\t')
                if len(parts) >= 5:
                    images.append({
                        'repository': parts[0].strip(),
                        'tag': parts[1].strip(),
                        'id': parts[2].strip(),
                        'created': parts[3].strip(),
                        'size': parts[4].strip()
                    })
        
        return images
    
    def _extract_disk_usage_gb(self, docker_df_output: str) -> float:
        """Extract total disk usage in GB from docker system df output."""
        try:
            # Look for total size in the output
            lines = docker_df_output.split('\n')
            for line in lines:
                if 'Total' in line or 'TOTAL' in line:
                    # Extract size using regex
                    size_match = re.search(r'(\d+\.?\d*)\s*([KMGT]?B)', line)
                    if size_match:
                        size_value = float(size_match.group(1))
                        size_unit = size_match.group(2)
                        
                        # Convert to GB
                        if size_unit == 'KB':
                            return size_value / (1024 * 1024)
                        elif size_unit == 'MB':
                            return size_value / 1024
                        elif size_unit == 'GB':
                            return size_value
                        elif size_unit == 'TB':
                            return size_value * 1024
                        else:  # Bytes
                            return size_value / (1024 * 1024 * 1024)
            
            return 0.0
        except Exception as e:
            logger.error(f"Error extracting disk usage: {e}")
            return 0.0
