import psutil
import docker
from docker.errors import DockerException
from loguru import logger
import os
from flask import jsonify, request
import schedule
import time
import socket
import requests
import threading
import os, sys
from loguru import logger
from dotenv import load_dotenv
import atexit
import subprocess
import json
import dateutil.parser
from datetime import datetime

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'), override=True)
manager_ip = os.getenv("MGMT_SERVER_IP")
manager_port = int(os.getenv("MGMT_SERVER_PORT"))
url = f"http://{manager_ip}:{manager_port}"

def get_machine_ip():
    """
    Get the IP address of the machine, with env var override support.
    Returns a tuple of (local_ip, public_ip). Set AGENT_PUBLIC_IP to override
    the auto-detected IP (useful when running inside a Docker bridge network).
    """
    override = os.environ.get('AGENT_PUBLIC_IP')
    if override:
        return override, override

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception as e:
        local_ip = "Could not determine local IP: " + str(e)

    return local_ip, local_ip

def register_agent(url, agent):
    try:
        response = requests.post(f"{url}/api/register_agent", json={"agent_ip": f"{agent}"}, timeout=5)
        if response.status_code == 200:
            logger.info(f"Agent {agent} registered successfully")
            if response.text.strip():
                logger.info(response.json())
        else:
            logger.warning(f"Failed to register agent {agent}: HTTP {response.status_code}")
    except requests.exceptions.ConnectionError:
        logger.warning(f"Cannot connect to management server at {url} - server may not be running")
    except requests.exceptions.Timeout:
        logger.warning(f"Timeout connecting to management server at {url}")
    except requests.exceptions.JSONDecodeError:
        logger.warning(f"Invalid JSON response from management server at {url}")
    except Exception as e:
        logger.error(f"Error registering agent: {e}")

def unregister_agent(url, agent):
    try:
        response = requests.post(f"{url}/api/unregister_agent", json={"agent_ip": f"{agent}"}, timeout=5)
        if response.status_code == 200:
            logger.info(f"Agent {agent} unregistered successfully")
            if response.text.strip():
                logger.info(response.json())
        else:
            logger.warning(f"Failed to unregister agent {agent}: HTTP {response.status_code}")
    except requests.exceptions.ConnectionError:
        logger.warning(f"Cannot connect to management server at {url} - server may not be running")
    except requests.exceptions.Timeout:
        logger.warning(f"Timeout connecting to management server at {url}")
    except requests.exceptions.JSONDecodeError:
        logger.warning(f"Invalid JSON response from management server at {url}")
    except Exception as e:
        logger.error(f"Error unregistering agent: {e}")

HEARTBEAT_INTERVAL = 30   # seconds between heartbeats
HEARTBEAT_RETRIES = 3     # attempts per heartbeat
REGISTER_MAX_RETRIES = 10  # attempts on startup


def _send_heartbeat(agent_ip: str) -> bool:
    for attempt in range(HEARTBEAT_RETRIES):
        try:
            response = requests.post(
                f"{url}/api/agent/heartbeat",
                json={"agent_ip": agent_ip},
                timeout=5,
            )
            if response.status_code == 200:
                return True
            logger.warning(f"Heartbeat rejected: HTTP {response.status_code}")
        except requests.exceptions.ConnectionError:
            logger.warning(f"Heartbeat: manager unreachable (attempt {attempt + 1}/{HEARTBEAT_RETRIES})")
        except requests.exceptions.Timeout:
            logger.warning(f"Heartbeat: timeout (attempt {attempt + 1}/{HEARTBEAT_RETRIES})")
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
        if attempt < HEARTBEAT_RETRIES - 1:
            time.sleep(2 ** attempt)  # 1s, 2s backoff
    return False


def _heartbeat_loop(agent_ip: str):
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        _send_heartbeat(agent_ip)


def register_agent_with_manager():
    localip, _ = get_machine_ip()
    registered = False
    for attempt in range(REGISTER_MAX_RETRIES):
        try:
            response = requests.post(
                f"{url}/api/register_agent",
                json={"agent_ip": localip},
                timeout=5,
            )
            if response.status_code == 200:
                logger.info(f"Registered with manager at {url}")
                registered = True
                break
            logger.warning(f"Registration rejected: HTTP {response.status_code}")
        except requests.exceptions.ConnectionError:
            logger.warning(f"Cannot reach manager at {url} (attempt {attempt + 1}/{REGISTER_MAX_RETRIES})")
        except requests.exceptions.Timeout:
            logger.warning(f"Registration timeout (attempt {attempt + 1}/{REGISTER_MAX_RETRIES})")
        except Exception as e:
            logger.error(f"Registration error: {e}")

        if attempt < REGISTER_MAX_RETRIES - 1:
            wait = min(30, 2 ** attempt)
            logger.info(f"Retrying registration in {wait}s...")
            time.sleep(wait)

    if not registered:
        logger.error(f"Failed to register after {REGISTER_MAX_RETRIES} attempts; running unregistered")
        return

    t = threading.Thread(target=_heartbeat_loop, args=(localip,), daemon=True, name="agent-heartbeat")
    t.start()


def on_exit():
    localip, _ = get_machine_ip()
    unregister_agent(url, localip)

atexit.register(on_exit)

# Simple cache for agent resources
_resource_cache = {
    'data': None,
    'timestamp': 0,
    'cache_duration': 10  # Cache for 10 seconds
}

def get_gpu_info():
    """
    Get GPU information using nvidia-smi if available.
    Returns GPU usage, memory usage, temperature, and other stats.
    """
    try:
        # Try to get GPU info using nvidia-smi
        result = subprocess.run([
            'nvidia-smi', 
            '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit',
            '--format=csv,noheader,nounits'
        ], capture_output=True, text=True, timeout=5)
        
        if result.returncode == 0:
            gpus = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    parts = [part.strip() for part in line.split(',')]
                    if len(parts) >= 8:
                        gpu_info = {
                            'index': int(parts[0]),
                            'name': parts[1],
                            'utilization': float(parts[2]) if parts[2] != '[Not Supported]' else 0,
                            'memory_used': float(parts[3]) if parts[3] != '[Not Supported]' else 0,
                            'memory_total': float(parts[4]) if parts[4] != '[Not Supported]' else 0,
                            'temperature': float(parts[5]) if parts[5] != '[Not Supported]' else 0,
                            'power_draw': float(parts[6]) if parts[6] != '[Not Supported]' else 0,
                            'power_limit': float(parts[7]) if parts[7] != '[Not Supported]' else 0
                        }
                        gpu_info['memory_utilization'] = (gpu_info['memory_used'] / gpu_info['memory_total'] * 100) if gpu_info['memory_total'] > 0 else 0
                        gpus.append(gpu_info)
            
            return {
                'available': True,
                'count': len(gpus),
                'gpus': gpus,
                'total_memory': sum(gpu['memory_total'] for gpu in gpus),
                'total_memory_used': sum(gpu['memory_used'] for gpu in gpus),
                'avg_utilization': sum(gpu['utilization'] for gpu in gpus) / len(gpus) if gpus else 0,
                'avg_memory_utilization': sum(gpu['memory_utilization'] for gpu in gpus) / len(gpus) if gpus else 0
            }
        else:
            logger.debug("nvidia-smi command failed or returned non-zero exit code")
            return {'available': False, 'error': 'nvidia-smi failed'}
            
    except subprocess.TimeoutExpired:
        logger.debug("nvidia-smi command timed out")
        return {'available': False, 'error': 'nvidia-smi timeout'}
    except FileNotFoundError:
        logger.debug("nvidia-smi not found - no NVIDIA GPU or drivers not installed")
        return {'available': False, 'error': 'nvidia-smi not found'}
    except Exception as e:
        logger.debug(f"Error getting GPU info: {e}")
        return {'available': False, 'error': str(e)}

def get_agent_resources():
    """
    Fetch server resource information (CPU, memory, Docker instances, etc.).
    Optimized for better performance by reducing Docker API calls.
    """
    current_time = time.time()
    
    # Check if we have valid cached data
    if (_resource_cache['data'] is not None and 
        current_time - _resource_cache['timestamp'] < _resource_cache['cache_duration']):
        return _resource_cache['data']
    
    # Cache miss or expired, fetch fresh data
    # Get system resources first (these are fast)
    cpu_count = psutil.cpu_count()
    cpu_percent = psutil.cpu_percent(interval=0.1)  # Short interval for faster response
    memory_info = psutil.virtual_memory()
    total_memory = memory_info.total / (1024**3)

    # Get disk usage information
    disk_info = psutil.disk_usage('/')
    total_disk = disk_info.total / (1024**3)  # Convert to GB
    used_disk = disk_info.used / (1024**3)    # Convert to GB
    
    # Get system uptime
    uptime_seconds = time.time() - psutil.boot_time()
    uptime_days = uptime_seconds // (24 * 3600)
    uptime_hours = (uptime_seconds % (24 * 3600)) // 3600
    uptime_minutes = (uptime_seconds % 3600) // 60
    uptime = f"{int(uptime_days)}d {int(uptime_hours)}h {int(uptime_minutes)}m"

    # Get GPU information
    gpu_info = get_gpu_info()

    # Initialize Docker-related variables
    docker_instances = 0
    allocated_cpu = 0
    allocated_memory = 0
    running_containers = 0

    try:
        # Use Docker client with timeout for better performance
        client = docker.from_env(timeout=5)
        
        # Get only running containers (faster than all containers)
        containers = client.containers.list(filters={'status': 'running'})
        running_containers = len(containers)
        
        # Optimized container processing - avoid expensive API calls
        code_server_containers = [c for c in containers if "code-server" in c.name]
        docker_instances = len(code_server_containers)
        
        # Only inspect containers if we need detailed resource allocation
        # For basic monitoring, we can skip the expensive inspect calls
        if docker_instances > 0:
            # Use batch processing for better performance
            for container in code_server_containers:
                try:
                    # Get container info in one call (faster than separate stats + inspect)
                    container.reload()  # Refresh container info
                    attrs = container.attrs
                    host_config = attrs.get("HostConfig", {})
                    
                    # Extract resource limits (these are set at container creation)
                    cpu_limit = host_config.get("CpuCount", 0)
                    memory_limit = host_config.get("Memory", 0)
                    
                    if cpu_limit:
                        allocated_cpu += cpu_limit
                    if memory_limit:
                        allocated_memory += memory_limit / (1024**3)
                        
                except Exception as container_error:
                    logger.debug(f"Error processing container {container.name}: {container_error}")
                    continue

    except DockerException as e:
        logger.warning(f"Docker not available or error: {e}")
        docker_instances = 0
        allocated_cpu = 0
        allocated_memory = 0
        running_containers = 0
    except Exception as e:
        logger.error(f"Unexpected error fetching Docker stats: {e}")
        docker_instances = 0
        allocated_cpu = 0
        allocated_memory = 0
        running_containers = 0
        
    remaining_cpu = cpu_count - allocated_cpu
    remaining_memory = total_memory - allocated_memory

    # Prepare the response data
    resource_data = {
        "cpu_count": cpu_count,
        "total_memory": round(total_memory, 2),
        "host_cpu_used": cpu_percent,
        "host_memory_used": round(memory_info.used / (1024**3), 2),
        "total_disk": round(total_disk, 2),
        "used_disk": round(used_disk, 2),
        "uptime": uptime,
        "docker_instances": docker_instances,
        "running_containers": running_containers,  # Total running containers
        "allocated_cpu": allocated_cpu,
        "allocated_memory": round(allocated_memory, 2),
        "remaining_cpu": remaining_cpu,
        "remaining_memory": round(remaining_memory, 2),
        "gpu_info": gpu_info,  # Add GPU information
    }
    
    # Update cache
    _resource_cache['data'] = resource_data
    _resource_cache['timestamp'] = current_time
    
    return resource_data

def get_docker_images():
    """
    Fetch Docker images information from the local Docker daemon.
    Returns detailed information about each image including layers and history.
    """
    try:
        # Initialize Docker client with timeout
        client = docker.from_env(timeout=5)
        
        # Get all images
        images = client.images.list()
        image_data = []
        
        for image in images:
            try:
                # Get image attributes
                attrs = image.attrs
                
                # Extract basic image information
                image_info = {
                    'id': image.id,
                    'short_id': image.short_id,
                    'tags': image.tags or ['<none>:<none>'],
                    'size': attrs.get('Size', 0),
                    'virtual_size': attrs.get('VirtualSize', 0),
                    'created': attrs.get('Created', ''),
                    'architecture': attrs.get('Architecture', 'unknown'),
                    'os': attrs.get('Os', 'unknown'),
                    'parent': attrs.get('Parent', ''),
                    'comment': attrs.get('Comment', ''),
                    'author': attrs.get('Author', ''),
                    'config': attrs.get('Config', {}),
                }
                
                # Extract repository and tag information
                if image.tags:
                    for tag in image.tags:
                        if ':' in tag:
                            repo, tag_name = tag.rsplit(':', 1)
                        else:
                            repo, tag_name = tag, 'latest'
                        
                        image_entry = image_info.copy()
                        image_entry.update({
                            'repository': repo,
                            'tag': tag_name,
                            'full_tag': tag
                        })
                        image_data.append(image_entry)
                else:
                    # Handle untagged images
                    image_entry = image_info.copy()
                    image_entry.update({
                        'repository': '<none>',
                        'tag': '<none>',
                        'full_tag': '<none>:<none>'
                    })
                    image_data.append(image_entry)
                    
            except Exception as e:
                logger.warning(f"Error processing image {image.id}: {e}")
                continue
        
        # Sort by creation date (newest first)
        image_data.sort(key=lambda x: x.get('created', ''), reverse=True)
        
        return {
            'images': image_data,
            'total_count': len(image_data),
            'total_size': sum(img.get('size', 0) for img in image_data),
            'timestamp': time.time()
        }
        
    except DockerException as e:
        logger.error(f"Docker daemon not available: {e}")
        return {
            'error': 'Docker daemon not available',
            'images': [],
            'total_count': 0,
            'total_size': 0,
            'timestamp': time.time()
        }
    except Exception as e:
        logger.error(f"Error fetching Docker images: {e}")
        return {
            'error': f'Error fetching Docker images: {str(e)}',
            'images': [],
            'total_count': 0,
            'total_size': 0,
            'timestamp': time.time()
        }

def get_docker_image_details(image_id):
    """
    Get detailed information about a specific Docker image including layers and history.
    """
    try:
        client = docker.from_env(timeout=5)
        
        # Get the specific image
        image = client.images.get(image_id)
        attrs = image.attrs
        
        # Extract layers information
        layers = []
        if 'RootFS' in attrs and 'Layers' in attrs['RootFS']:
            for i, layer_id in enumerate(attrs['RootFS']['Layers']):
                layers.append({
                    'id': layer_id,
                    'index': i,
                    'size': 'unknown'  # Layer size is not directly available
                })
        
        # Extract history information
        history = []
        if 'History' in attrs:
            for i, hist_entry in enumerate(attrs['History']):
                history.append({
                    'id': f"hist_{i}",
                    'created': hist_entry.get('Created', ''),
                    'created_by': hist_entry.get('CreatedBy', ''),
                    'size': hist_entry.get('Size', 0),
                    'comment': hist_entry.get('Comment', ''),
                    'empty_layer': hist_entry.get('EmptyLayer', False)
                })
        
        return {
            'image_id': image_id,
            'layers': layers,
            'history': history,
            'config': attrs.get('Config', {}),
            'architecture': attrs.get('Architecture', 'unknown'),
            'os': attrs.get('Os', 'unknown'),
            'timestamp': time.time()
        }
        
    except DockerException as e:
        logger.error(f"Docker daemon not available: {e}")
        return {'error': 'Docker daemon not available'}
    except Exception as e:
        logger.error(f"Error fetching image details for {image_id}: {e}")
        return {'error': f'Error fetching image details: {str(e)}'}

def get_detailed_containers():
    """
    Get detailed information about all containers including stats and resource usage.
    """
    try:
        client = docker.from_env(timeout=5)
        
        # Get all containers (running and stopped)
        containers = client.containers.list(all=True)
        container_data = []
        
        for container in containers:
            try:
                # Get container attributes
                container.reload()
                attrs = container.attrs
                
                # Calculate uptime
                created_time = dateutil.parser.parse(attrs['Created'])
                uptime_seconds = (datetime.now(created_time.tzinfo) - created_time).total_seconds()
                
                # Format uptime
                if uptime_seconds < 60:
                    uptime = f"{int(uptime_seconds)}s"
                elif uptime_seconds < 3600:
                    uptime = f"{int(uptime_seconds // 60)}m {int(uptime_seconds % 60)}s"
                elif uptime_seconds < 86400:
                    hours = int(uptime_seconds // 3600)
                    minutes = int((uptime_seconds % 3600) // 60)
                    uptime = f"{hours}h {minutes}m"
                else:
                    days = int(uptime_seconds // 86400)
                    hours = int((uptime_seconds % 86400) // 3600)
                    uptime = f"{days}d {hours}h"
                
                # Get resource stats if container is running
                cpu_usage = 0.0
                memory_usage = 0.0
                memory_used_mb = 0.0
                memory_limit_mb = 0.0
                network_rx_bytes = 0
                network_tx_bytes = 0
                
                if container.status == 'running':
                    try:
                        stats = container.stats(stream=False)
                        
                        # Calculate CPU usage
                        cpu_stats = stats.get("cpu_stats", {})
                        precpu_stats = stats.get("precpu_stats", {})
                        
                        cpu_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
                        precpu_total = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
                        system_cpu_usage = cpu_stats.get("system_cpu_usage", 0)
                        previous_system_cpu_usage = precpu_stats.get("system_cpu_usage", 0)
                        
                        online_cpus = cpu_stats.get("online_cpus", 1) or 1
                        cpu_delta = cpu_total - precpu_total
                        system_delta = system_cpu_usage - previous_system_cpu_usage
                        
                        if system_delta > 0 and cpu_delta > 0:
                            cpu_usage = (cpu_delta / system_delta) * 100.0 * online_cpus
                        
                        # Calculate memory usage
                        memory_stats = stats.get("memory_stats", {})
                        memory_used = memory_stats.get("usage", 0)
                        memory_limit = memory_stats.get("limit", 1) or 1
                        memory_usage = (memory_used / memory_limit) * 100.0
                        memory_used_mb = memory_used / (1024 * 1024)
                        memory_limit_mb = memory_limit / (1024 * 1024)
                        
                        # Get network stats
                        networks = stats.get("networks", {})
                        for network_name, network_stats in networks.items():
                            network_rx_bytes += network_stats.get("rx_bytes", 0)
                            network_tx_bytes += network_stats.get("tx_bytes", 0)
                            
                    except Exception as stats_error:
                        logger.debug(f"Error getting stats for container {container.name}: {stats_error}")
                
                # Extract port information
                ports = []
                port_bindings = attrs.get("NetworkSettings", {}).get("Ports", {})
                if port_bindings:
                    for container_port, host_bindings in port_bindings.items():
                        if host_bindings:
                            for binding in host_bindings:
                                ports.append({
                                    "container_port": container_port,
                                    "host_ip": binding.get("HostIp", "0.0.0.0"),
                                    "host_port": binding.get("HostPort", "")
                                })
                        else:
                            ports.append({
                                "container_port": container_port,
                                "host_ip": "",
                                "host_port": ""
                            })
                
                # Extract volume information
                volumes = []
                mounts = attrs.get("Mounts", [])
                for mount in mounts:
                    volumes.append({
                        "source": mount.get("Source", ""),
                        "destination": mount.get("Destination", ""),
                        "mode": mount.get("Mode", ""),
                        "type": mount.get("Type", "")
                    })
                
                # Extract environment variables
                env_vars = attrs.get("Config", {}).get("Env", [])
                
                # Get command
                cmd = attrs.get("Config", {}).get("Cmd", [])
                command = " ".join(cmd) if cmd else ""
                
                # Get labels
                labels = attrs.get("Config", {}).get("Labels", {}) or {}
                
                # Get restart count
                restart_count = attrs.get("RestartCount", 0)
                
                # Get platform
                platform = attrs.get("Platform", "linux/amd64")
                
                container_info = {
                    'id': container.id,
                    'name': container.name,
                    'image': container.image.tags[0] if container.image.tags else container.image.id[:12],
                    'status': container.status,
                    'state': attrs.get("State", {}).get("Status", "unknown"),
                    'created': attrs['Created'],
                    'started': attrs.get("State", {}).get("StartedAt", ""),
                    'finished': attrs.get("State", {}).get("FinishedAt", ""),
                    'uptime': uptime,
                    'cpu_usage': round(cpu_usage, 2),
                    'memory_usage': round(memory_usage, 2),
                    'memory_used_mb': round(memory_used_mb, 2),
                    'memory_limit_mb': round(memory_limit_mb, 2),
                    'disk_usage': None,  # Docker doesn't provide easy disk usage per container
                    'network_rx_bytes': network_rx_bytes,
                    'network_tx_bytes': network_tx_bytes,
                    'ports': ports,
                    'volumes': volumes,
                    'environment': env_vars,
                    'command': command,
                    'labels': labels,
                    'restart_count': restart_count,
                    'platform': platform
                }
                
                container_data.append(container_info)
                
            except Exception as e:
                logger.warning(f"Error processing container {container.name}: {e}")
                continue
        
        # Sort by creation date (newest first)
        container_data.sort(key=lambda x: x.get('created', ''), reverse=True)
        
        # Calculate summary stats
        total_count = len(container_data)
        running_count = len([c for c in container_data if c['status'] == 'running'])
        stopped_count = total_count - running_count
        
        return {
            'containers': container_data,
            'total_count': total_count,
            'running_count': running_count,
            'stopped_count': stopped_count,
            'timestamp': time.time()
        }
        
    except DockerException as e:
        logger.error(f"Docker daemon not available: {e}")
        return {
            'error': 'Docker daemon not available',
            'containers': [],
            'total_count': 0,
            'running_count': 0,
            'stopped_count': 0,
            'timestamp': time.time()
        }
    except Exception as e:
        logger.error(f"Error fetching container details: {e}")
        return {
            'error': f'Error fetching container details: {str(e)}',
            'containers': [],
            'total_count': 0,
            'running_count': 0,
            'stopped_count': 0,
            'timestamp': time.time()
        }

def init_stats_routes(app):
    @app.route('/get_resources', methods=['GET'])
    def get_resources():
        resources = get_agent_resources()
        return jsonify(resources)
    
    @app.route('/get_docker_images', methods=['GET'])
    def get_docker_images_route():
        """Get all Docker images from this agent"""
        images_data = get_docker_images()
        return jsonify(images_data)
    
    @app.route('/get_docker_image_details/<image_id>', methods=['GET'])
    def get_docker_image_details_route(image_id):
        """Get detailed information about a specific Docker image"""
        image_details = get_docker_image_details(image_id)
        return jsonify(image_details)
    
    @app.route('/delete_docker_image/<image_id>', methods=['DELETE'])
    def delete_docker_image_route(image_id):
        """Delete a Docker image from this agent"""
        try:
            data = request.get_json() or {}
            force = data.get('force', False)
            
            client = docker.from_env()
            
            # URL decode the image_id in case it contains special characters
            from urllib.parse import unquote
            decoded_image_id = unquote(image_id)
            
            client.images.remove(decoded_image_id, force=force)
            
            logger.info(f"Successfully deleted Docker image: {decoded_image_id}")
            return jsonify({
                'success': True,
                'message': f'Image {decoded_image_id} deleted successfully'
            })
        except docker.errors.ImageNotFound:
            logger.warning(f"Docker image not found: {image_id}")
            return jsonify({
                'success': False,
                'error': f'Image not found: {image_id}'
            }), 404
        except docker.errors.APIError as e:
            logger.error(f"Docker API error deleting image {image_id}: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 400
        except Exception as e:
            logger.error(f"Error deleting Docker image {image_id}: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    @app.route('/get_containers', methods=['GET'])
    def get_containers_route():
        """Get detailed information about all containers"""
        containers_data = get_detailed_containers()
        return jsonify(containers_data)
