from flask import request, jsonify, send_from_directory
import docker
import docker.errors
import docker.models
import docker.models.containers
import dateutil.parser
import subprocess
import shutil
import uuid
import os
import threading
import hashlib
from datetime import datetime
from loguru import logger
from dotenv import load_dotenv

from resource_allocator import PortManager

# Configure logger
logger.add("agent_service.log", rotation="500 MB", retention="10 days", level="INFO")

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'), override=True)

class DockerContainerManager:
    def __init__(self):
        """Initialize Docker client and lock"""
        try:
            self.client = docker.from_env()
            self.lock = threading.Lock()
        except docker.errors.DockerException as e:
            logger.error(f"Error connecting to Docker daemon: {e}")
            raise

    def create_container(
        self,
        image_name,
        container_name=None,
        ports=None,
        volumes=None,
        environment=None,
        command=None,
        detach=True,
        cpu_count=None,
        cpu_percent=None,
        memory_limit=None,
        memory_swap=None,
        memory_reservation=None,
        host_name="cx-qvp",
    ):
        with self.lock:
            try:
                try:
                    self.client.images.get(image_name)
                except docker.errors.ImageNotFound:
                    logger.warning(f"Pulling image {image_name}...")
                    try:
                        self.client.images.pull(image_name)
                    except docker.errors.APIError as e:
                        logger.error("Failed pulling image")
                        return None, f"Failed pulling image {image_name} Exception : {e}"

                # Try with nvidia runtime first, fallback if not available
                try:
                    container = self.client.containers.run(
                        image=image_name,
                        name=container_name,
                        ports=ports,
                        volumes=volumes,
                        environment=environment,
                        command=command,
                        detach=detach,
                        cpu_count=cpu_count,
                        cpu_percent=cpu_percent,
                        mem_limit=memory_limit,
                        memswap_limit=memory_swap,
                        hostname=host_name,
                        runtime="nvidia",
                        privileged=True,
                        # IMPORTANT: Do NOT set remove=True - this causes container data loss on stop
                        remove=False,
                    )
                except docker.errors.APIError as e:
                    if "runtime" in str(e).lower() and "nvidia" in str(e).lower():
                        logger.warning("NVIDIA runtime not available, creating container without GPU support")
                        container = self.client.containers.run(
                            image=image_name,
                            name=container_name,
                            ports=ports,
                            volumes=volumes,
                            environment=environment,
                            command=command,
                            detach=detach,
                            cpu_count=cpu_count,
                            cpu_percent=cpu_percent,
                            mem_limit=memory_limit,
                            memswap_limit=memory_swap,
                            hostname=host_name,
                            privileged=True,
                            remove=False,
                        )
                    else:
                        raise
                logger.success(f"Container created successfully: {container.name}")
                return container, "Success"

            except docker.errors.APIError as e:
                logger.error(f"Error creating container: {e}")
                return None, f"Error creating container: {e}"

    def list_container(self, name):
        with self.lock:
            try:
                return self.client.containers.get(name)
            except docker.errors.NotFound:
                logger.error(f"Container {name} not found")
                return None
            except docker.errors.APIError as e:
                logger.error(f"Error getting container: {e}")
                return None

    def start_container(self, container_id_or_name, recreate_if_missing=False, user_data=None):
        """Start a container. If not found and recreate_if_missing=True, recreate from existing workdir."""
        try:
            with self.lock:
                container = self.client.containers.get(container_id_or_name)
                container.start()
            logger.success(f"Container {container_id_or_name} started successfully")
            return True
        except docker.errors.NotFound:
            logger.warning(f"Container {container_id_or_name} not found")
            if recreate_if_missing and user_data:
                logger.info(f"Attempting to recreate container {container_id_or_name}")
                return self.create_container_from_workdir(user_data)
            logger.error(f"Container {container_id_or_name} not found and recreation not enabled")
            return False
        except docker.errors.APIError as e:
            logger.error(f"Error starting container: {e}")
            return False

    def create_container_from_workdir(self, user_data):
        """Recreate a container using existing workdir for a user.
        
        Args:
            user_data: Dict containing:
                - username: User's username
                - ports: Dict with port mappings (optional, will allocate if not provided)
                - cpu_count: CPU count (optional, uses env default)
                - memory_limit: Memory limit (optional, uses env default)
        
        Returns:
            True if container created and started successfully, False otherwise
        """
        try:
            username = user_data.get('username')
            if not username:
                logger.error("Username is required to recreate container")
                return False
            
            logger.info(f"Recreating container for user {username} using existing workdir")
            
            # Get Docker image configuration
            docker_image_name = os.getenv("DOCKER_IMAGE", "gpu-dev-environment")
            docker_image_tag = os.getenv("DOCKER_TAG", "latest")
            
            # Setup workdir paths
            dir_deploy = (
                os.getenv("WORKDIR_DEPLOY", "/home/vms/")
                + f"{username}-{docker_helper.generate_user_hash(username)}"
            )
            
            # Verify workdir exists
            if not os.path.exists(dir_deploy):
                logger.error(f"Workdir {dir_deploy} does not exist for user {username}")
                return False
            
            logger.info(f"Using existing workdir: {dir_deploy}")
            
            # Get start_port from user_data if provided
            start_port = None
            if user_data.get('ports'):
                ports_data = user_data['ports']
                start_port = int(ports_data.get('start_port', ports_data.get('code', 0)))
            
            # Build container configuration using helper
            config = docker_helper.build_container_config(username, dir_deploy, start_port)
            
            # Get container name
            container_name = docker_helper.get_container_name(username)
            
            # Get resource limits from user_data or use defaults
            cpu_count = user_data.get('cpu_count') if user_data.get('cpu_count') else int(os.getenv("DOCKER_CPU", 2))
            memory_limit = user_data.get('memory_limit') if user_data.get('memory_limit') else os.getenv("DOCKER_MEM_LMT", "2g")
            
            # Ensure memory_limit is set when using memory_swap
            # Docker requires memory_limit to be set when memory_swap is specified
            if not memory_limit:
                memory_limit = "2g"  # Default fallback
            
            # Create the container
            container, error = self.create_container(
                image_name=f"{docker_image_name}:{docker_image_tag}",
                container_name=container_name,
                ports=config['ports'],
                volumes=config['volumes'],
                environment=config['env'],
                cpu_count=cpu_count,
                cpu_percent=int(os.getenv("DOCKER_CPU_PERCENT", 100)),
                memory_limit=memory_limit,
                memory_swap=os.getenv("DOCKER_MEM_SWAP", "3g"),
                host_name=os.getenv("DOCKER_HOSTNAME", "cxl-qvp"),
            )
            
            if container:
                logger.success(f"Successfully recreated container {container_name} for user {username}")
                return True
            else:
                logger.error(f"Failed to recreate container for user {username}: {error}")
                return False
                
        except Exception as e:
            logger.error(f"Error recreating container from workdir: {e}")
            return False

    def recreate_container(self, user_data, wipe_data=False):
        """Recreate a container for a user with optional data wipe.
        
        This method will:
        1. Stop and remove the existing container (if it exists)
        2. Optionally wipe user workspace data
        3. Create a fresh container
        
        Args:
            user_data: Dict containing:
                - username: User's username (required)
                - ports: Dict with port mappings (optional)
                - cpu_count: CPU count (optional)
                - memory_limit: Memory limit (optional)
            wipe_data: If True, wipe user workspace data and start fresh.
                      If False, preserve existing workspace data.
        
        Returns:
            Dict with success status, message, and details
        """
        result = {
            'success': False,
            'message': '',
            'container_stopped': False,
            'container_removed': False,
            'data_wiped': False,
            'container_created': False
        }
        
        try:
            username = user_data.get('username')
            if not username:
                result['message'] = 'Username is required to recreate container'
                logger.error(result['message'])
                return result
            
            logger.info(f"Recreating container for user {username} (wipe_data={wipe_data})")
            
            # Get container name
            container_name = docker_helper.get_container_name(username)
            
            # Step 1: Stop and remove existing container
            try:
                container = self.client.containers.get(container_name)
                
                # Stop container if running
                if container.status == 'running':
                    try:
                        container.stop(timeout=10)
                        result['container_stopped'] = True
                        logger.info(f"Container {container_name} stopped successfully")
                    except docker.errors.APIError as e:
                        logger.warning(f"Error stopping container {container_name}: {e}")
                
                # Remove container
                try:
                    container.remove(force=True)
                    result['container_removed'] = True
                    logger.info(f"Container {container_name} removed successfully")
                except docker.errors.APIError as e:
                    result['message'] = f"Failed to remove container: {e}"
                    logger.error(result['message'])
                    return result
                    
            except docker.errors.NotFound:
                logger.info(f"Container {container_name} not found, will create new one")
                result['container_removed'] = True  # Consider it removed if not found
            
            # Step 2: Handle data wipe if requested
            dir_deploy = (
                os.getenv("WORKDIR_DEPLOY", "/home/vms/")
                + f"{username}-{docker_helper.generate_user_hash(username)}"
            )
            
            if wipe_data:
                logger.info(f"Wiping user data for {username}")
                
                # Get workspace path
                workspace_path = os.path.join(dir_deploy, "workspace")
                
                if os.path.exists(workspace_path):
                    try:
                        # Remove workspace contents but keep the directory
                        for item in os.listdir(workspace_path):
                            item_path = os.path.join(workspace_path, item)
                            if os.path.isfile(item_path):
                                os.remove(item_path)
                            elif os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                        
                        result['data_wiped'] = True
                        logger.info(f"Workspace data wiped for user {username}")
                    except PermissionError:
                        # Try with sudo if not running as root
                        try:
                            subprocess.run(["sudo", "rm", "-rf", f"{workspace_path}/*"], check=True, shell=False)
                            result['data_wiped'] = True
                            logger.info(f"Workspace data wiped via sudo for user {username}")
                        except Exception as e:
                            logger.warning(f"Could not wipe workspace data: {e}")
                    except Exception as e:
                        logger.warning(f"Could not wipe workspace data for {username}: {e}")
                
                # Also wipe VS Code extensions if needed
                extensions_path = os.path.join(dir_deploy, "code/config/extensions")
                if os.path.exists(extensions_path):
                    try:
                        for item in os.listdir(extensions_path):
                            item_path = os.path.join(extensions_path, item)
                            if os.path.isfile(item_path):
                                os.remove(item_path)
                            elif os.path.isdir(item_path):
                                shutil.rmtree(item_path)
                        logger.info(f"VS Code extensions wiped for user {username}")
                    except Exception as e:
                        logger.warning(f"Could not wipe VS Code extensions: {e}")
            
            # Step 3: Setup workdir (will preserve data if not wiped)
            dir_template = os.getenv("WORKDIR_TEMPLATE", "/opt/cxl/")
            
            if not os.path.exists(dir_deploy):
                # If workdir doesn't exist, create it from template
                if not docker_helper.setup_workdir(username, dir_template, dir_deploy):
                    result['message'] = "Failed to setup workdir"
                    logger.error(result['message'])
                    return result
            elif wipe_data:
                # Re-setup workdir from template after wipe
                if not docker_helper.setup_workdir(username, dir_template, dir_deploy):
                    result['message'] = "Failed to re-setup workdir after wipe"
                    logger.error(result['message'])
                    return result
            
            # Step 4: Create the container
            if self.create_container_from_workdir(user_data):
                result['container_created'] = True
                result['success'] = True
                
                if wipe_data:
                    result['message'] = f"Container {container_name} recreated successfully with fresh data"
                else:
                    result['message'] = f"Container {container_name} recreated successfully with existing data preserved"
                
                logger.success(result['message'])
            else:
                result['message'] = f"Failed to create new container for user {username}"
                logger.error(result['message'])
            
            return result
                
        except Exception as e:
            result['message'] = f"Error recreating container: {str(e)}"
            logger.error(result['message'])
            return result

    def stop_container(self, container_id_or_name):
        with self.lock:
            try:
                container = self.client.containers.get(container_id_or_name)
                container.stop()
                logger.success(f"Container {container_id_or_name} stopped successfully")
                return True
            except docker.errors.NotFound:
                logger.error(f"Container {container_id_or_name} not found")
                return False
            except docker.errors.APIError as e:
                logger.error(f"Error stopping container: {e}")
                return False

    def restart_container(self, container_id_or_name):
        with self.lock:
            try:
                container = self.client.containers.get(container_id_or_name)
                container.restart()
                logger.success(f"Container {container_id_or_name} restarted successfully")
                return True
            except docker.errors.NotFound:
                logger.error(f"Container {container_id_or_name} not found")
                return False
            except docker.errors.APIError as e:
                logger.error(f"Error restarting container: {e}")
                return False

    def remove_container(self, container_id_or_name, force=False):
        with self.lock:
            try:
                container = self.client.containers.get(container_id_or_name)
                container.remove(force=force)
                logger.success(f"Container {container_id_or_name} removed successfully")
                return True
            except docker.errors.NotFound:
                logger.error(f"Container {container_id_or_name} not found")
                return False
            except docker.errors.APIError as e:
                logger.error(f"Error removing container: {e}")
                return False

    def delete_container(self, container_id_or_name, user_id=None, username=None):
        result = {
            'success': False,
            'message': '',
            'container_stopped': False,
            'container_removed': False,
            'ports_deallocated': False
        }
        try:
            with self.lock:
                try:
                    container = self.client.containers.get(container_id_or_name)

                    if container.status == 'running':
                        try:
                            container.stop(timeout=10)
                            result['container_stopped'] = True
                            logger.info(f"Container {container_id_or_name} stopped")
                        except docker.errors.APIError as e:
                            logger.warning(f"Error stopping container {container_id_or_name}: {e}")

                    try:
                        container.remove(force=True)
                        result['container_removed'] = True
                        logger.success(f"Container {container_id_or_name} removed")
                    except docker.errors.APIError as e:
                        logger.error(f"Error removing container {container_id_or_name}: {e}")
                        result['message'] = f"Failed to remove container: {e}"
                        return result

                except docker.errors.NotFound:
                    logger.warning(f"Container {container_id_or_name} not found, treating as removed")
                    result['container_removed'] = True

            # Port deallocation outside the lock — doesn't need it
            if user_id:
                try:
                    deallocated = PortManager().deallocate_ports(username)
                    result['ports_deallocated'] = True
                    if deallocated:
                        logger.info(f"Ports deallocated for user {username}")
                    else:
                        logger.info(f"No ports to deallocate for user {username}")
                except Exception as e:
                    logger.error(f"Error deallocating ports for user {username}: {e}")
                    result['message'] += f" Port deallocation failed: {e}"

            if result['container_removed']:
                result['success'] = True
                result['message'] = f"Container {container_id_or_name} deleted successfully"
            else:
                result['message'] = f"Failed to delete container {container_id_or_name}"

            return result

        except Exception as e:
            logger.error(f"Unexpected error deleting container {container_id_or_name}: {e}")
            return {
                'success': False,
                'message': f"Unexpected error: {e}",
                'container_stopped': False,
                'container_removed': False,
                'ports_deallocated': False
            }

    def get_container_stats(self, container):
        # container.stats(stream=False) is a blocking Docker API call (~1s).
        # Do NOT hold the lock during it — it would starve all other operations.
        try:
            stats = container.stats(stream=False)
        except docker.errors.APIError as e:
            logger.error(f"Error fetching stats for container: {e}")
            return {"cpu_usage": 0, "memory_usage": 0, "memory_used": 0, "memory_limit": 0}
        except Exception as e:
            logger.error(f"Unexpected error fetching stats: {e}")
            return {"cpu_usage": 0, "memory_usage": 0, "memory_used": 0, "memory_limit": 0}

        try:
            cpu_stats = stats.get("cpu_stats", {})
            precpu_stats = stats.get("precpu_stats", {})
            memory_stats = stats.get("memory_stats", {})

            cpu_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            precpu_total = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            system_cpu_usage = cpu_stats.get("system_cpu_usage", 0)
            previous_system_cpu_usage = precpu_stats.get("system_cpu_usage", 0)
            online_cpus = cpu_stats.get("online_cpus", 1) or 1
            cpu_delta = cpu_total - precpu_total
            system_delta = system_cpu_usage - previous_system_cpu_usage

            cpu_usage = (
                (cpu_delta / system_delta) * 100.0 * online_cpus
                if system_delta > 0 and cpu_delta > 0
                else 0.0
            )

            memory_usage = memory_stats.get("usage", 0)
            memory_limit = memory_stats.get("limit", 1) or 1
            memory_percentage = (memory_usage / memory_limit) * 100.0

            return {
                "cpu_usage": round(cpu_usage, 2),
                "memory_usage": round(memory_percentage, 2),
                "memory_used": round(memory_usage / (1024 * 1024), 2),
                "memory_limit": round(memory_limit / (1024 * 1024), 2),
            }
        except Exception as e:
            logger.error(f"Error calculating stats: {e}")
            return {"cpu_usage": 0, "memory_usage": 0, "memory_used": 0, "memory_limit": 0}


class DockerHelper:
    def build_container_config(self, username, dir_deploy, start_port=None):
        """Build container configuration for creation.
        
        Args:
            username: Username for the container
            dir_deploy: Deployment directory path
            start_port: Starting port number (optional, will be allocated if not provided)
        
        Returns:
            Dict with container configuration including env, volumes, ports, etc.
        """
        # Setup environment variables
        env = {
            "PUID": os.geteuid(),
            "PGID": os.getegid(),
            "TZ": "Etc/UTC",
            "DEFAULT_WORKSPACE": os.getenv("DEFAULT_WORKSPACE", "/config/workspace"),
            "SUDO_PASSWORD": os.getenv("SUDO_PASSWORD") or _warn_missing_sudo_password(),
            "JUPYTER_BASE_URL": f"/user/{username}/jupyter",
            "JUPYTERHUB_SERVICE_PREFIX": f"/user/{username}/jupyter/",
        }
        
        # Setup volume paths
        guest_os_path_host = os.path.join(dir_deploy, "guestos")
        vscode_extensions_path_host = os.path.join(dir_deploy, "code/config/extensions")
        qvp_bin_path_host = os.path.join(dir_deploy, "qvp")
        tools_path_host = os.path.join(dir_deploy, "tools")
        arm_path_host = os.path.join(dir_deploy, "tools/ARMCompiler6.16")
        workspace_path_host = os.path.join(dir_deploy, "workspace")
        kvm_path_host = "/dev/kvm"
        
        # Ensure workspace and extensions directories have proper permissions (0o777 to allow user writes)
        for path in [workspace_path_host, vscode_extensions_path_host]:
            if os.path.exists(path):
                try:
                    os.chown(path, 1000, 1000)
                    os.chmod(path, 0o777)
                    logger.debug(f"Updated permissions: {path}")
                except PermissionError:
                    # Try with sudo if not running as root
                    try:
                        import subprocess
                        subprocess.run(["sudo", "chown", "-R", "1000:1000", path], check=True)
                        subprocess.run(["sudo", "chmod", "-R", "777", path], check=True)
                        logger.debug(f"Updated permissions via sudo: {path}")
                    except Exception as e:
                        logger.warning(f"Could not update permissions for {path}: {e}")
                except Exception as e:
                    logger.warning(f"Could not update permissions for {path}: {e}")

        # Pre-create .local/share subtree so Docker doesn't create parents as root
        # when mounting the nested code-server volume inside the workspace.
        # os.makedirs only chowns the leaf; we need every dir in the chain owned
        # by uid 1000, otherwise Jupyter fails with PermissionError at startup.
        local_share = os.path.join(workspace_path_host, ".local", "share")
        for rel_dir in ["jupyter/runtime", "notebooks"]:
            dir_path = os.path.join(local_share, rel_dir)
            try:
                os.makedirs(dir_path, exist_ok=True)
            except PermissionError:
                subprocess.run(["sudo", "mkdir", "-p", dir_path], check=True)
            except Exception as e:
                logger.warning(f"Could not mkdir {dir_path}: {e}")

        # chown the entire .local tree in one pass — catches any root-owned dirs
        # that Docker may have created for previous nested mounts
        local_root = os.path.join(workspace_path_host, ".local")
        if os.path.exists(local_root):
            try:
                for dirpath, dirnames, _ in os.walk(local_root):
                    os.chown(dirpath, 1000, 1000)
            except PermissionError:
                subprocess.run(["sudo", "chown", "-R", "1000:1000", local_root], check=True)
            except Exception as e:
                logger.warning(f"Could not chown {local_root}: {e}")
        
        # Setup volumes
        # workspace -> home folder for persistence
        # code/config/extensions -> .local/share/code-server for VS Code extensions
        volumes = {}
        volume_mounts = [
            (guest_os_path_host, os.getenv("GUEST_OS_MOUNT", "/opt/guestos"), "rw"),
            (vscode_extensions_path_host, "/home/developer/.local/share/code-server", "rw"),
            (qvp_bin_path_host, os.getenv("QVP_BINARY_MOUNT", "/opt/qvp"), "rw"),
            (tools_path_host, os.getenv("TOOLS_MOUNT", "/opt/tools"), "ro"),
            (arm_path_host, "/usr/local/ARMCompiler6.16", "ro"),
            (workspace_path_host, "/home/developer", "rw"),
            (kvm_path_host, "/dev/kvm", "rw"),
        ]
        
        for host_path, container_path, mode in volume_mounts:
            if os.path.exists(host_path):
                volumes[host_path] = {
                    "bind": container_path,
                    "mode": mode,
                }
        
        # Get or allocate ports
        port_manager = PortManager()
        if start_port is None:
            # Get existing ports or allocate new ones
            ports_data = port_manager.get_allocated_ports(username)
            if not ports_data:
                ports_data = port_manager.allocate_ports(username)
            start_port = int(ports_data["start_port"])
        
        # Setup port mappings
        ports = {}
        ports[os.getenv("CODE_PORT", 8080)] = start_port
        ports[os.getenv("JUPYTER_PORT", 8888)] = start_port + 1
        ports[os.getenv("GUEST_OS_SSH_PORT", 22)] = start_port + 2
        
        return {
            'env': env,
            'volumes': volumes,
            'ports': ports,
            'start_port': start_port
        }
    
    def is_valid_dir(self, dir):
        if not os.path.exists(dir):
            return False, "Destination directory does not exist."
        if not os.path.isdir(dir):
            return False, "Destination path is not a directory."
        if not os.listdir(dir):
            return False, "Destination directory is empty."
        return True, "Destination directory is valid."

    def is_valid_sign(self, dir):
        signature_file = f"{dir}/signature.txt"
        if not os.path.exists(signature_file):
            return False, "Signature file does not exist."
        with open(signature_file, "r") as file:
            content = file.read()
            if "Timestamp:" not in content or "Unique Hash:" not in content:
                return False, "Signature file is missing required content."
        return True, "Signature file is valid."

    def generate_user_hash(self, username: str) -> str:
        hash_obj = hashlib.sha256(username.encode())
        return hash_obj.hexdigest()[:16]

    def setup_workdir(self, user, dir_template, dir_deploy):
        valid_dir, dir_error = self.is_valid_dir(dir_deploy)
        valid_sign, sign_error = self.is_valid_sign(dir_deploy)

        if valid_dir and valid_sign:
            logger.success("Valid workdir exists")
            # Ensure workspace and extensions have proper permissions even if workdir already exists
            workspace_path = os.path.join(dir_deploy, "workspace")
            extensions_path = os.path.join(dir_deploy, "code/config/extensions")
            for path in [workspace_path, extensions_path]:
                if os.path.exists(path):
                    try:
                        os.chown(path, 1000, 1000)
                        os.chmod(path, 0o777)  # rwxrwxrwx to allow user writes
                        logger.info(f"Updated permissions for existing directory: {path}")
                    except PermissionError:
                        # Try with sudo if not running as root
                        try:
                            import subprocess
                            subprocess.run(["sudo", "chown", "-R", "1000:1000", path], check=True)
                            subprocess.run(["sudo", "chmod", "-R", "777", path], check=True)
                            logger.info(f"Updated permissions via sudo: {path}")
                        except Exception as e:
                            logger.warning(f"Could not update permissions for {path}: {e}")
                    except Exception as e:
                        logger.warning(f"Could not update permissions for {path}: {e}")
            return True

        logger.warning(f"{dir_error}, {sign_error}")

        try:
            os.makedirs(dir_deploy, exist_ok=True)
            
            # IMPORTANT: Preserve existing workspace directory to prevent data loss
            workspace_path = os.path.join(dir_deploy, "workspace")
            workspace_existed = os.path.exists(workspace_path)
            if workspace_existed:
                logger.info(f"Preserving existing workspace directory: {workspace_path}")

            for item in os.listdir(dir_template):
                src_path = os.path.join(dir_template, item)
                dst_path = os.path.join(dir_deploy, item)
                
                # Skip workspace directory if it already exists to preserve user data
                if item == "workspace" and workspace_existed:
                    logger.info(f"Skipping workspace copy to preserve existing user data")
                    continue

                if os.path.isfile(src_path):
                    # Only copy file if it doesn't exist (don't overwrite)
                    if not os.path.exists(dst_path):
                        shutil.copy2(src_path, dst_path)
                elif os.path.isdir(src_path):
                    # Only copy directory if it doesn't exist (don't overwrite)
                    if not os.path.exists(dst_path):
                        shutil.copytree(src_path, dst_path)
                    else:
                        logger.info(f"Skipping existing directory: {dst_path}")

            # Ensure workspace and extensions directories exist and have proper permissions
            extensions_path = os.path.join(dir_deploy, "code/config/extensions")
            os.makedirs(workspace_path, exist_ok=True)
            os.makedirs(extensions_path, exist_ok=True)
            
            # Set proper ownership and permissions for workspace and extensions
            # Use 1000:1000 (developer user inside container) with 0o777 to allow writes
            for target_path in [workspace_path, extensions_path]:
                try:
                    # Set ownership recursively
                    for root, dirs, files in os.walk(target_path):
                        os.chown(root, 1000, 1000)
                        os.chmod(root, 0o777)  # rwxrwxrwx for directories
                        for d in dirs:
                            dir_path = os.path.join(root, d)
                            os.chown(dir_path, 1000, 1000)
                            os.chmod(dir_path, 0o777)
                        for f in files:
                            file_path = os.path.join(root, f)
                            os.chown(file_path, 1000, 1000)
                            os.chmod(file_path, 0o666)  # rw-rw-rw- for files
                    logger.info(f"Set permissions during setup: {target_path}")
                except PermissionError:
                    # Try with sudo if not running as root
                    try:
                        import subprocess
                        subprocess.run(["sudo", "chown", "-R", "1000:1000", target_path], check=True)
                        subprocess.run(["sudo", "chmod", "-R", "777", target_path], check=True)
                        logger.info(f"Set permissions via sudo during setup: {target_path}")
                    except Exception as e:
                        logger.warning(f"Could not set permissions for {target_path}: {e}")
                except Exception as e:
                    logger.warning(f"Could not set permissions during setup for {target_path}: {e}")

            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            unique_hash = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()
            signature_file_path = os.path.join(dir_deploy, "signature.txt")
            with open(signature_file_path, "w") as signature_file:
                signature_file.write(f"Timestamp: {timestamp}\n")
                signature_file.write(f"Unique Hash: {unique_hash}\n")

            return True
        except Exception as e:
            logger.error(f"Failed setting up workdir for user {user}: {e}")
            return False

    def create_overlay(self, base_image_path, overlay_image_path):
        try:
            command = f"qemu-img create -f qcow2 -b {base_image_path} -F qcow2 {overlay_image_path}"
            subprocess.check_call(command, shell=True)
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to create overlay image: {e}")
            return False

    def get_container_name(self, user):
        return f"code-server-{user}-{self.generate_user_hash(user)}"


def _warn_missing_sudo_password():
    logger.warning("SUDO_PASSWORD env var is not set; container will use its own default")
    return ""


# Initialize Docker manager
docker_manager = DockerContainerManager()
docker_helper = DockerHelper()

# Static file serving directory
STATIC_DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static/downloads')

# Ensure the downloads directory exists
os.makedirs(STATIC_DOWNLOADS_DIR, exist_ok=True)

def init_backend_routes(app):
    @app.route('/downloads/<path:filename>')
    def download_file(filename):
        return send_from_directory(STATIC_DOWNLOADS_DIR, filename, as_attachment=True)

    @app.route("/api/containers/create", methods=["POST"])
    def create_container():
        data = request.get_json()
        user = data["user"]
        session_token = data["session_token"]

        env = {
            "PUID": os.geteuid(),
            "PGID": os.getegid(),
            "TZ": "Etc/UTC",
            "DEFAULT_WORKSPACE": os.getenv("DEFAULT_WORKSPACE", "/config/workspace"),
            "SUDO_PASSWORD": os.getenv("SUDO_PASSWORD") or _warn_missing_sudo_password(),
            "JUPYTER_BASE_URL": f"/user/{user}/jupyter",
            "JUPYTERHUB_SERVICE_PREFIX": f"/user/{user}/jupyter/",
        }

        docker_image_name = os.getenv("DOCKER_IMAGE", "gpu-dev-environment")
        docker_image_tag = os.getenv("DOCKER_TAG", "latest")

        dir_template = os.getenv("WORKDIR_TEMPLATE", "/opt/cxl/")
        dir_deploy = (
            os.getenv("WORKDIR_DEPLOY", "/home/vms/")
            + f"{user}-{docker_helper.generate_user_hash(user)}"
        )

        if not docker_helper.setup_workdir(user, dir_template, dir_deploy):
            return jsonify({"success": False, "error": "Failed setting up work dir"}), 400

        guest_os_list = []
        guest_os_env = os.getenv("GUEST_OS_LIST")
        if guest_os_env:
            guest_os_list = [item.strip() for item in guest_os_env.split(",")]
        for guest_os in guest_os_list:
            dst_path = (
                f"{dir_deploy}/guestos/{os.path.basename(os.path.dirname(guest_os))}"
            )
            os.makedirs(dst_path, exist_ok=True)
            file_name = os.path.basename(guest_os)
            name, ext = os.path.splitext(file_name)
            new_file_name = f"{dst_path}/{name}_overlay{ext}"

            if not docker_helper.create_overlay(guest_os, new_file_name):
                return jsonify({"success": False, "error": "Failed creating guest os overlay"}), 400

        # TODO revamp this section
        container_name = docker_helper.get_container_name(user)
        
        # Check if container already exists
        existing_container = docker_manager.list_container(container_name)
        if existing_container:
            logger.info(f"Container {container_name} already exists, returning existing container info")
            return jsonify(
                {
                    "success": True,
                    "container": {
                        "id": existing_container.id,
                        "name": existing_container.name,
                        "status": existing_container.status,
                    },
                    "message": "Container already exists and is being reused"
                }
            )
        
        # Allocate ports first
        port_manager = PortManager()
        new_ports = port_manager.allocate_ports(user)
        start_port = int(new_ports["start_port"])
        
        # Build container configuration using helper
        config = docker_helper.build_container_config(user, dir_deploy, start_port)

        try:
            container, error = docker_manager.create_container(
                image_name=f"{docker_image_name}:{docker_image_tag}",
                container_name=container_name,
                ports=config['ports'],
                volumes=config['volumes'],
                environment=config['env'],
                cpu_count=int(os.getenv("DOCKER_CPU", 2)),
                cpu_percent=int(os.getenv("DOCKER_CPU_PERCENT", 100)),
                memory_limit=os.getenv("DOCKER_MEM_LMT", "2g"),
                memory_swap=os.getenv("DOCKER_MEM_SWAP", "3g"),
                host_name=os.getenv("DOCKER_HOSTNAME", "cxl-qvp"),
            )

            if container:
                logger.success(f"Created container: {str(container.id)}")
                return jsonify(
                    {
                        "success": True,
                        "container": {
                            "id": container.id,
                            "name": container.name,
                            "status": container.status,
                            "port_map": {
                                "code": config['start_port'],
                                "jupyter": config['start_port'] + 1,
                                "ssh": config['start_port'] + 2,
                            },
                        },
                    }
                )
            else:
                logger.error(f"Failed to create container: {str(error)}")
                return jsonify({"success": False, "error": str(error)}), 400
        except Exception as e:
            logger.error(f"Failed to create container: {str(e)}")
            return jsonify({"success": False, "error": str(e)}), 400

    @app.route("/api/containers/<string:container_id>/start", methods=["POST"])
    def start_container(container_id):
        """Start a container. If not found, attempt to recreate it from existing workdir."""
        try:
            data = request.get_json(silent=True, force=True) or {}
            logger.info(f"Starting container {container_id} with data: {data}")
            
            # Extract username from container name (format: code-server-username-hash)
            username = None
            if container_id.startswith('code-server-'):
                parts = container_id.split('-')
                if len(parts) >= 3:
                    # Join all parts between 'code-server-' and the hash (last part)
                    username = '-'.join(parts[2:-1])
                    logger.info(f"Extracted username: {username} from container_id: {container_id}")
            
            # Prepare user_data for potential recreation
            user_data = None
            if username:
                user_data = {
                    'username': username,
                    'ports': data.get('ports'),  # Optional: can be provided by caller
                    'cpu_count': data.get('cpu_count'),  # Optional
                    'memory_limit': data.get('memory_limit'),  # Optional
                }
                logger.info(f"Prepared user_data for recreation: {user_data}")
            
            # Try to start container, with recreation if it doesn't exist
            if docker_manager.start_container(container_id, recreate_if_missing=True, user_data=user_data):
                logger.success(f"Container {container_id} started successfully")
                return jsonify({"success": True})
            else:
                logger.error(f"Failed to start container {container_id}")
                return jsonify({"success": False, "error": "Failed to start container"}), 400
        except Exception as e:
            logger.error(f"Error in start_container endpoint: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.route("/api/containers/<string:container_id>/stop", methods=["POST"])
    def stop_container(container_id):
        if docker_manager.stop_container(container_id):
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to stop container"}), 400

    @app.route("/api/containers/<string:container_id>/remove", methods=["POST"])
    def remove_container(container_id):
        if docker_manager.remove_container(container_id, force=True):
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to remove container"}), 400

    @app.route("/api/containers/<string:container_id>/delete", methods=["POST"])
    def delete_container(container_id):
        data = request.get_json() or {}
        result = docker_manager.delete_container(container_id, data.get('user_id'),
                                                data.get('username'))
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400

    @app.route("/api/containers/<string:container_id>/restart", methods=["POST"])
    def restart_container(container_id):
        if docker_manager.restart_container(container_id):
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to restart container"}), 400

    @app.route("/api/containers/<string:container_id>/recreate", methods=["POST"])
    def recreate_container(container_id):
        """Recreate a container with optional data wipe.
        
        POST body:
            - wipe_data: (bool) If true, wipe user workspace data and start fresh
            - ports: (dict, optional) Port mappings
            - cpu_count: (int, optional) CPU count
            - memory_limit: (str, optional) Memory limit (e.g., "2g")
        """
        try:
            data = request.get_json(silent=True, force=True) or {}
            wipe_data = data.get('wipe_data', False)
            
            logger.info(f"Recreating container {container_id} with wipe_data={wipe_data}")
            
            # Extract username from container name (format: code-server-username-hash)
            username = None
            if container_id.startswith('code-server-'):
                parts = container_id.split('-')
                if len(parts) >= 3:
                    # Join all parts between 'code-server-' and the hash (last part)
                    username = '-'.join(parts[2:-1])
                    logger.info(f"Extracted username: {username} from container_id: {container_id}")
            
            if not username:
                return jsonify({
                    "success": False, 
                    "error": "Could not extract username from container name"
                }), 400
            
            # Prepare user_data for recreation
            user_data = {
                'username': username,
                'ports': data.get('ports'),
                'cpu_count': data.get('cpu_count'),
                'memory_limit': data.get('memory_limit'),
            }
            
            # Recreate the container
            result = docker_manager.recreate_container(user_data, wipe_data=wipe_data)
            
            if result['success']:
                return jsonify(result)
            else:
                return jsonify(result), 400
                
        except Exception as e:
            logger.error(f"Error in recreate_container endpoint: {e}")
            return jsonify({"success": False, "error": str(e)}), 500
    
    @app.route("/api/containers/<string:container_id>/stats", methods=["GET"])
    def get_stats(container_id):
        container = docker_manager.list_container(container_id)
        if container:
            stats = docker_manager.get_container_stats(container)
            return jsonify({"success": True, "stats": stats})
        return jsonify({"success": False, "error": "Container not found"}), 404

    @app.route("/api/containers/<string:container_id>/status", methods=["GET"])
    def get_container_status(container_id):
        """Get real-time container status"""
        try:
            container = docker_manager.list_container(container_id)
            if container:
                return jsonify({
                    "success": True,
                    "status": container.status,
                    "id": container.id,
                    "name": container.name
                })
            else:
                return jsonify({
                    "success": True,
                    "status": "stopped",
                    "id": None,
                    "name": container_id
                })
        except Exception as e:
            logger.error(f"Error getting container status for {container_id}: {e}")
            return jsonify({
                "success": False,
                "error": str(e),
                "status": "unknown"
            }), 500

    @app.route("/api/containers/<string:container_id>/ports", methods=["GET"])
    def get_port_info(container_id):
        port_manager = PortManager()
        
        # Extract username from container_id (format: code-server-{username}-{hash})
        # e.g., code-server-u1-bb82030dbc2bcaba -> u1
        username = container_id
        if container_id.startswith('code-server-'):
            parts = container_id.replace('code-server-', '').split('-')
            if parts:
                username = parts[0]
        
        new_ports = port_manager.get_allocated_ports(username)
        if not new_ports:
            return jsonify({"success": False, "error": f"No ports allocated for {username}"}), 404
            
        start_port = int(new_ports["start_port"])
        
        port_info = {
            "code_port": start_port,
            "ssh_port": start_port + 1,
            "spice_port": start_port + 2,
            "fm_ui_port": start_port + 3,
            "fm_port": start_port + 4,
            "jupyter_port": start_port + 8  # Jupyter is typically at offset 8
        }
        
        return jsonify({"success": True, "port_info": port_info})