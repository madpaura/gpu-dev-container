from typing import Dict, List, Optional, Any
import requests
import time
import threading
from loguru import logger
from models.container import ContainerInfo, ContainerListResponse, ContainerActionResponse
from services.agent_service import AgentService

class ContainerService:
    """Service for managing Docker containers across multiple servers"""
    
    def __init__(self, agent_service: AgentService):
        self.agent_service = agent_service
        self._container_cache = {}
        self._cache_duration = 30  # Cache for 30 seconds
        self._cache_lock = threading.Lock()
    
    def get_containers_from_server(self, server_ip: str, search_term: Optional[str] = None) -> ContainerListResponse:
        """Get detailed container information from a specific server"""
        try:
            # Check cache first
            cache_key = f"{server_ip}_containers"
            current_time = time.time()

            with self._cache_lock:
                cached_entry = self._container_cache.get(cache_key)
                if (cached_entry is not None and
                        current_time - cached_entry['timestamp'] < self._cache_duration):
                    cached_data = cached_entry['data']
                    logger.debug(f"Using cached container data for {server_ip}")
                else:
                    cached_data = None

            if cached_data is None:
                # Fetch fresh data from agent (outside lock)
                logger.debug(f"Fetching container data from agent {server_ip}")
                response = requests.get(
                    f"http://{server_ip}:{self.agent_service.agent_port}/get_containers",
                    timeout=100
                )

                if response.status_code == 200:
                    cached_data = response.json()
                    # Update cache atomically
                    with self._cache_lock:
                        self._container_cache[cache_key] = {
                            'data': cached_data,
                            'timestamp': current_time
                        }
                else:
                    logger.error(f"Failed to get containers from {server_ip}: HTTP {response.status_code}")
                    return ContainerListResponse(
                        success=False,
                        server_id=server_ip.replace('.', '-'),
                        server_ip=server_ip,
                        containers=[],
                        total_count=0,
                        running_count=0,
                        stopped_count=0,
                        error=f"HTTP {response.status_code}"
                    )
            
            # Check for errors in response
            if 'error' in cached_data:
                return ContainerListResponse(
                    success=False,
                    server_id=server_ip.replace('.', '-'),
                    server_ip=server_ip,
                    containers=[],
                    total_count=0,
                    running_count=0,
                    stopped_count=0,
                    error=cached_data['error']
                )
            
            # Convert to ContainerInfo objects
            containers = []
            for container_data in cached_data.get('containers', []):
                # Apply search filter if provided
                if search_term:
                    search_lower = search_term.lower()
                    if not any([
                        search_lower in container_data.get('name', '').lower(),
                        search_lower in container_data.get('image', '').lower(),
                        search_lower in container_data.get('id', '').lower(),
                        search_lower in container_data.get('status', '').lower()
                    ]):
                        continue
                
                container_info = ContainerInfo(
                    id=container_data.get('id', ''),
                    name=container_data.get('name', ''),
                    image=container_data.get('image', ''),
                    status=container_data.get('status', ''),
                    state=container_data.get('state', ''),
                    created=container_data.get('created', ''),
                    started=container_data.get('started', ''),
                    finished=container_data.get('finished'),
                    uptime=container_data.get('uptime', ''),
                    cpu_usage=container_data.get('cpu_usage', 0.0),
                    memory_usage=container_data.get('memory_usage', 0.0),
                    memory_used_mb=container_data.get('memory_used_mb', 0.0),
                    memory_limit_mb=container_data.get('memory_limit_mb', 0.0),
                    disk_usage=container_data.get('disk_usage'),
                    network_rx_bytes=container_data.get('network_rx_bytes', 0),
                    network_tx_bytes=container_data.get('network_tx_bytes', 0),
                    ports=container_data.get('ports', []),
                    volumes=container_data.get('volumes', []),
                    environment=container_data.get('environment', []),
                    command=container_data.get('command', ''),
                    labels=container_data.get('labels', {}),
                    restart_count=container_data.get('restart_count', 0),
                    platform=container_data.get('platform', 'linux/amd64')
                )
                containers.append(container_info)
            
            # Calculate filtered counts
            total_count = len(containers)
            running_count = len([c for c in containers if c.status == 'running'])
            stopped_count = total_count - running_count
            
            return ContainerListResponse(
                success=True,
                server_id=server_ip.replace('.', '-'),
                server_ip=server_ip,
                containers=containers,
                total_count=total_count,
                running_count=running_count,
                stopped_count=stopped_count
            )
            
        except requests.exceptions.ConnectionError:
            logger.error(f"Cannot connect to agent at {server_ip}")
            return ContainerListResponse(
                success=False,
                server_id=server_ip.replace('.', '-'),
                server_ip=server_ip,
                containers=[],
                total_count=0,
                running_count=0,
                stopped_count=0,
                error="Connection failed - agent may be offline"
            )
        except requests.exceptions.Timeout:
            logger.error(f"Timeout connecting to agent at {server_ip}")
            return ContainerListResponse(
                success=False,
                server_id=server_ip.replace('.', '-'),
                server_ip=server_ip,
                containers=[],
                total_count=0,
                running_count=0,
                stopped_count=0,
                error="Connection timeout"
            )
        except Exception as e:
            logger.error(f"Error getting containers from {server_ip}: {e}")
            return ContainerListResponse(
                success=False,
                server_id=server_ip.replace('.', '-'),
                server_ip=server_ip,
                containers=[],
                total_count=0,
                running_count=0,
                stopped_count=0,
                error=str(e)
            )
    
    def perform_container_action(self, server_ip: str, container_id: str, action: str, force: bool = False) -> ContainerActionResponse:
        """Perform an action on a container (start, stop, restart, delete)"""
        try:
            logger.info(f"Performing {action} on container {container_id} at server {server_ip}")
            
            # Map action to endpoint
            endpoint_map = {
                'start': f"/api/containers/{container_id}/start",
                'stop': f"/api/containers/{container_id}/stop", 
                'restart': f"/api/containers/{container_id}/restart",
                'delete': f"/api/containers/{container_id}/delete"
            }
            
            if action not in endpoint_map:
                return ContainerActionResponse(
                    success=False,
                    action=action,
                    container_id=container_id,
                    container_name="",
                    message=f"Invalid action: {action}",
                    error=f"Unsupported action: {action}"
                )
            
            endpoint = endpoint_map[action]
            
            # Prepare request data
            data = {}
            if action == 'delete':
                data = {'force': force}
            
            # Make request to agent
            response = requests.post(
                f"http://{server_ip}:{self.agent_service.agent_port}{endpoint}",
                json=data,
                timeout=100
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Clear cache to force refresh
                cache_key = f"{server_ip}_containers"
                with self._cache_lock:
                    self._container_cache.pop(cache_key, None)
                
                return ContainerActionResponse(
                    success=True,
                    action=action,
                    container_id=container_id,
                    container_name=result.get('container_name', container_id),
                    message=f"Container {action} completed successfully",
                    new_status=self._get_expected_status(action)
                )
            else:
                error_msg = f"HTTP {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', error_msg)
                except:
                    pass
                
                return ContainerActionResponse(
                    success=False,
                    action=action,
                    container_id=container_id,
                    container_name="",
                    message=f"Failed to {action} container",
                    error=error_msg
                )
                
        except requests.exceptions.ConnectionError:
            return ContainerActionResponse(
                success=False,
                action=action,
                container_id=container_id,
                container_name="",
                message="Connection failed",
                error="Cannot connect to server - agent may be offline"
            )
        except requests.exceptions.Timeout:
            return ContainerActionResponse(
                success=False,
                action=action,
                container_id=container_id,
                container_name="",
                message="Request timeout",
                error="Operation timed out"
            )
        except Exception as e:
            logger.error(f"Error performing {action} on container {container_id}: {e}")
            return ContainerActionResponse(
                success=False,
                action=action,
                container_id=container_id,
                container_name="",
                message=f"Unexpected error during {action}",
                error=str(e)
            )
    
    def _get_expected_status(self, action: str) -> Optional[str]:
        """Get expected container status after action"""
        status_map = {
            'start': 'running',
            'stop': 'exited',
            'restart': 'running',
            'delete': None  # Container will be removed
        }
        return status_map.get(action)
    
    def clear_cache(self):
        """Clear the container cache"""
        with self._cache_lock:
            self._container_cache.clear()
        logger.debug("Container cache cleared")
