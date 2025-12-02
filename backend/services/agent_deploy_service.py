"""
Agent Deployment Service
-------------------------
Handles remote deployment of agents to servers via SSH.
Includes:
- SSH connection and command execution
- Agent package creation and transfer
- Folder structure setup
- Template copying
- Service installation
- Prerequisite checks (Python, Docker, etc.)
"""

import os
import io
import json
import tarfile
import tempfile
import threading
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
from loguru import logger

try:
    import paramiko
    from paramiko import SSHClient, AutoAddPolicy, SFTPClient
    HAS_PARAMIKO = True
except ImportError:
    HAS_PARAMIKO = False
    logger.warning("paramiko not installed. Agent deployment will not work.")


class DeploymentStatus(Enum):
    PENDING = "pending"
    CONNECTING = "connecting"
    CHECKING_PREREQUISITES = "checking_prerequisites"
    CREATING_DIRECTORIES = "creating_directories"
    TRANSFERRING_AGENT = "transferring_agent"
    TRANSFERRING_TEMPLATE = "transferring_template"
    INSTALLING_DEPENDENCIES = "installing_dependencies"
    CONFIGURING_AGENT = "configuring_agent"
    INSTALLING_SERVICE = "installing_service"
    STARTING_SERVICE = "starting_service"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class PrerequisiteCheck:
    name: str
    status: str  # "passed", "failed", "warning", "skipped"
    message: str
    details: Optional[str] = None
    required: bool = True


@dataclass
class DeploymentProgress:
    status: DeploymentStatus = DeploymentStatus.PENDING
    current_step: str = ""
    progress_percent: int = 0
    logs: List[str] = field(default_factory=list)
    prerequisites: List[Dict] = field(default_factory=list)
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    
    def add_log(self, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append(f"[{timestamp}] {message}")
    
    def to_dict(self) -> Dict:
        return {
            "status": self.status.value,
            "current_step": self.current_step,
            "progress_percent": self.progress_percent,
            "logs": self.logs,
            "prerequisites": self.prerequisites,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at
        }


@dataclass
class DeploymentConfig:
    # Remote server connection
    server_ip: str
    ssh_user: str
    ssh_password: str
    ssh_port: int = 22
    
    # Agent configuration
    agent_port: int = 8510
    agent_install_path: str = "/opt/gpu-agent"
    
    # Template configuration
    template_source_path: str = ""  # Local path to template
    template_deploy_path: str = ""  # Remote path for user workspaces
    
    # Manager connection
    manager_ip: str = ""
    manager_port: int = 8500
    
    # Docker configuration
    docker_image: str = "gpu-dev-env-test"
    docker_tag: str = "latest"
    
    # Service configuration
    service_user: str = ""  # Will default to ssh_user
    create_venv: bool = True
    
    # Registry configuration (optional)
    registry_url: str = ""
    registry_user: str = ""
    registry_password: str = ""


class AgentDeployService:
    """Service for deploying agents to remote servers."""
    
    # Files to include in agent package
    AGENT_FILES = [
        "agent_server.py",
        "container_manager.py",
        "monitoring_service.py",
        "resource_allocator.py",
        "config_validator.py",
        "requirements-agent.txt",
        "config.toml",
        "gpu-coder-agent.service",
    ]
    
    def __init__(self):
        self.deployments: Dict[str, DeploymentProgress] = {}
        self.agent_source_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 
            "agent"
        )
    
    def _get_ssh_client(self, config: DeploymentConfig) -> SSHClient:
        """Create and connect SSH client."""
        if not HAS_PARAMIKO:
            raise RuntimeError("paramiko is not installed")
        
        client = SSHClient()
        client.set_missing_host_key_policy(AutoAddPolicy())
        client.connect(
            hostname=config.server_ip,
            port=config.ssh_port,
            username=config.ssh_user,
            password=config.ssh_password,
            timeout=30
        )
        return client
    
    def _exec_command(self, ssh: SSHClient, command: str, 
                      progress: DeploymentProgress, 
                      sudo: bool = False,
                      password: str = None) -> tuple[int, str, str]:
        """Execute command on remote server."""
        if sudo:
            command = f"echo '{password}' | sudo -S {command}"
        
        progress.add_log(f"$ {command.replace(password, '****') if password else command}")
        
        stdin, stdout, stderr = ssh.exec_command(command, timeout=300)
        exit_code = stdout.channel.recv_exit_status()
        stdout_text = stdout.read().decode('utf-8', errors='replace')
        stderr_text = stderr.read().decode('utf-8', errors='replace')
        
        if stdout_text.strip():
            for line in stdout_text.strip().split('\n')[:10]:  # Limit output
                progress.add_log(f"  {line}")
        
        if stderr_text.strip() and exit_code != 0:
            for line in stderr_text.strip().split('\n')[:5]:
                progress.add_log(f"  [ERR] {line}")
        
        return exit_code, stdout_text, stderr_text
    
    def check_prerequisites(self, config: DeploymentConfig, 
                           progress: DeploymentProgress) -> List[PrerequisiteCheck]:
        """Check all prerequisites on remote server."""
        checks = []
        
        progress.status = DeploymentStatus.CHECKING_PREREQUISITES
        progress.current_step = "Checking prerequisites..."
        progress.progress_percent = 5
        
        try:
            ssh = self._get_ssh_client(config)
            
            # Check Python
            progress.add_log("Checking Python installation...")
            exit_code, stdout, _ = self._exec_command(ssh, "python3 --version", progress)
            if exit_code == 0:
                version = stdout.strip()
                checks.append(PrerequisiteCheck(
                    name="Python 3",
                    status="passed",
                    message=version,
                    required=True
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="Python 3",
                    status="failed",
                    message="Python 3 not found",
                    details="Install with: sudo apt install python3 python3-pip python3-venv",
                    required=True
                ))
            
            # Check pip
            progress.add_log("Checking pip...")
            exit_code, stdout, _ = self._exec_command(ssh, "python3 -m pip --version", progress)
            if exit_code == 0:
                checks.append(PrerequisiteCheck(
                    name="pip",
                    status="passed",
                    message="pip available",
                    required=True
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="pip",
                    status="failed",
                    message="pip not found",
                    details="Install with: sudo apt install python3-pip",
                    required=True
                ))
            
            # Check venv
            progress.add_log("Checking python3-venv...")
            exit_code, _, _ = self._exec_command(ssh, "python3 -m venv --help", progress)
            if exit_code == 0:
                checks.append(PrerequisiteCheck(
                    name="python3-venv",
                    status="passed",
                    message="venv module available",
                    required=True
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="python3-venv",
                    status="failed",
                    message="venv module not found",
                    details="Install with: sudo apt install python3-venv",
                    required=True
                ))
            
            # Check Docker
            progress.add_log("Checking Docker...")
            exit_code, stdout, _ = self._exec_command(ssh, "docker --version", progress)
            if exit_code == 0:
                version = stdout.strip()
                checks.append(PrerequisiteCheck(
                    name="Docker",
                    status="passed",
                    message=version,
                    required=True
                ))
                
                # Check Docker daemon
                exit_code, _, _ = self._exec_command(ssh, "docker info", progress)
                if exit_code == 0:
                    checks.append(PrerequisiteCheck(
                        name="Docker Daemon",
                        status="passed",
                        message="Docker daemon running",
                        required=True
                    ))
                else:
                    checks.append(PrerequisiteCheck(
                        name="Docker Daemon",
                        status="failed",
                        message="Docker daemon not running or no permission",
                        details="Ensure docker is running and user is in docker group",
                        required=True
                    ))
            else:
                checks.append(PrerequisiteCheck(
                    name="Docker",
                    status="failed",
                    message="Docker not installed",
                    details="Install Docker: https://docs.docker.com/engine/install/",
                    required=True
                ))
            
            # Check if user is in docker group
            progress.add_log("Checking docker group membership...")
            exit_code, stdout, _ = self._exec_command(ssh, "groups", progress)
            if "docker" in stdout:
                checks.append(PrerequisiteCheck(
                    name="Docker Group",
                    status="passed",
                    message="User in docker group",
                    required=True
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="Docker Group",
                    status="warning",
                    message="User not in docker group",
                    details=f"Add with: sudo usermod -aG docker {config.ssh_user}",
                    required=False
                ))
            
            # Check Docker images
            progress.add_log("Checking Docker images...")
            exit_code, stdout, _ = self._exec_command(
                ssh, 
                f"docker images --format '{{{{.Repository}}}}:{{{{.Tag}}}}' | grep -E '{config.docker_image}'",
                progress
            )
            if exit_code == 0 and stdout.strip():
                checks.append(PrerequisiteCheck(
                    name="Docker Image",
                    status="passed",
                    message=f"Image {config.docker_image} found",
                    required=False
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="Docker Image",
                    status="warning",
                    message=f"Image {config.docker_image} not found",
                    details="Image will need to be pulled or built",
                    required=False
                ))
            
            # Check registry access if configured
            if config.registry_url:
                progress.add_log(f"Checking registry access: {config.registry_url}...")
                exit_code, _, _ = self._exec_command(
                    ssh,
                    f"docker login {config.registry_url} -u {config.registry_user} -p {config.registry_password}",
                    progress
                )
                if exit_code == 0:
                    checks.append(PrerequisiteCheck(
                        name="Registry Access",
                        status="passed",
                        message=f"Can access {config.registry_url}",
                        required=False
                    ))
                else:
                    checks.append(PrerequisiteCheck(
                        name="Registry Access",
                        status="warning",
                        message=f"Cannot access registry",
                        details="Check registry credentials",
                        required=False
                    ))
            
            # Check systemd
            progress.add_log("Checking systemd...")
            exit_code, _, _ = self._exec_command(ssh, "systemctl --version", progress)
            if exit_code == 0:
                checks.append(PrerequisiteCheck(
                    name="systemd",
                    status="passed",
                    message="systemd available",
                    required=True
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="systemd",
                    status="warning",
                    message="systemd not available",
                    details="Service auto-start may not work",
                    required=False
                ))
            
            # Check disk space
            progress.add_log("Checking disk space...")
            exit_code, stdout, _ = self._exec_command(
                ssh, 
                "df -h / | tail -1 | awk '{print $4}'",
                progress
            )
            if exit_code == 0:
                free_space = stdout.strip()
                checks.append(PrerequisiteCheck(
                    name="Disk Space",
                    status="passed",
                    message=f"Free space: {free_space}",
                    required=False
                ))
            
            # Check KVM (for guest OS)
            progress.add_log("Checking KVM support...")
            exit_code, _, _ = self._exec_command(ssh, "ls /dev/kvm", progress)
            if exit_code == 0:
                checks.append(PrerequisiteCheck(
                    name="KVM",
                    status="passed",
                    message="/dev/kvm available",
                    required=False
                ))
            else:
                checks.append(PrerequisiteCheck(
                    name="KVM",
                    status="warning",
                    message="KVM not available",
                    details="Guest OS features may not work",
                    required=False
                ))
            
            ssh.close()
            
        except Exception as e:
            logger.error(f"Error checking prerequisites: {e}")
            checks.append(PrerequisiteCheck(
                name="Connection",
                status="failed",
                message=f"Failed to connect: {str(e)}",
                required=True
            ))
        
        progress.prerequisites = [asdict(c) for c in checks]
        return checks
    
    def _create_agent_package(self, config: DeploymentConfig) -> bytes:
        """Create a tar.gz package of agent files."""
        buffer = io.BytesIO()
        
        with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
            for filename in self.AGENT_FILES:
                filepath = os.path.join(self.agent_source_path, filename)
                if os.path.exists(filepath):
                    tar.add(filepath, arcname=filename)
                else:
                    logger.warning(f"Agent file not found: {filepath}")
            
            # Add static directory if exists
            static_dir = os.path.join(self.agent_source_path, "static")
            if os.path.exists(static_dir):
                for root, dirs, files in os.walk(static_dir):
                    for file in files:
                        filepath = os.path.join(root, file)
                        arcname = os.path.relpath(filepath, self.agent_source_path)
                        tar.add(filepath, arcname=arcname)
        
        buffer.seek(0)
        return buffer.read()
    
    def _generate_env_file(self, config: DeploymentConfig) -> str:
        """Generate .env file content for the agent."""
        env_content = f"""
# Manager console
MGMT_SERVER_PORT="{config.manager_port}"
MGMT_SERVER_IP="{config.manager_ip}"

# AGENTS configuration
AGENT_PORT="{config.agent_port}"
AGENT_IP="{config.server_ip}"

# QVP docker for container creation
DOCKER_IMAGE="{config.docker_image}"
DOCKER_TAG="{config.docker_tag}"
DOCKER_HOSTNAME="cxl-dev"
DOCKER_CPU=4
DOCKER_CPU_PERCENT=100
DOCKER_MEM_LMT="4g"
DOCKER_MEM_SWAP="5g"

# coder-server
CODE_DEFAULT_WORKSPACE="/workspace"
CODE_PORT="8080"
CODE_CONFIG_MOUNT="/config"
SUDO_PASSWORD="abc"

# jupyter
JUPYTER_PORT="8888"

# QVP Binaries
QVP_TAG="0.1"
QVP_BINARY_MOUNT="/opt/qvp"

# Guest OS
GUEST_OS_MOUNT="/opt/os/guestos"
GUEST_OS_SSH_PORT="2222"
GUEST_OS_SPICE_PORT="3007"

# Tools mount
TOOLS_MOUNT="/opt/tools"

# WORKDIR setup
WORKDIR_TEMPLATE="{config.template_deploy_path}/template/"
WORKDIR_DEPLOY="{config.template_deploy_path}/vms/"
WORKSPACE_MOUNT="/home/developer"
"""
        return env_content.strip()
    
    def _generate_service_file(self, config: DeploymentConfig) -> str:
        """Generate systemd service file."""
        service_user = config.service_user or config.ssh_user
        service_content = f"""[Unit]
Description=GPU Coder Agent Service
After=network.target docker.service
Wants=network.target
Requires=docker.service

[Service]
Type=simple
User={service_user}
Group={service_user}
WorkingDirectory={config.agent_install_path}
Environment=PATH=/usr/bin:/usr/local/bin
Environment=PYTHONPATH={config.agent_install_path}
ExecStart=/bin/bash -c "cd {config.agent_install_path} && source venv/bin/activate && python agent_server.py"
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gpu-coder-agent

[Install]
WantedBy=multi-user.target
"""
        return service_content
    
    def deploy_agent(self, config: DeploymentConfig, 
                     deployment_id: str,
                     callback: Optional[Callable] = None) -> DeploymentProgress:
        """Deploy agent to remote server."""
        progress = DeploymentProgress()
        progress.started_at = datetime.now().isoformat()
        self.deployments[deployment_id] = progress
        
        def run_deployment():
            try:
                # Step 1: Check prerequisites
                checks = self.check_prerequisites(config, progress)
                failed_required = [c for c in checks if c.status == "failed" and c.required]
                
                if failed_required:
                    progress.status = DeploymentStatus.FAILED
                    progress.error = f"Prerequisites failed: {', '.join(c.name for c in failed_required)}"
                    return
                
                progress.progress_percent = 15
                
                # Step 2: Connect and create directories
                progress.status = DeploymentStatus.CREATING_DIRECTORIES
                progress.current_step = "Creating directories..."
                progress.add_log("Connecting to server...")
                
                ssh = self._get_ssh_client(config)
                sftp = ssh.open_sftp()
                
                # Create agent directory
                progress.add_log(f"Creating agent directory: {config.agent_install_path}")
                self._exec_command(
                    ssh, 
                    f"sudo mkdir -p {config.agent_install_path}",
                    progress,
                    sudo=True,
                    password=config.ssh_password
                )
                self._exec_command(
                    ssh,
                    f"sudo chown -R {config.ssh_user}:{config.ssh_user} {config.agent_install_path}",
                    progress,
                    sudo=True,
                    password=config.ssh_password
                )
                
                # Create template directories
                if config.template_deploy_path:
                    progress.add_log(f"Creating template directories: {config.template_deploy_path}")
                    self._exec_command(
                        ssh,
                        f"sudo mkdir -p {config.template_deploy_path}/template {config.template_deploy_path}/vms",
                        progress,
                        sudo=True,
                        password=config.ssh_password
                    )
                    self._exec_command(
                        ssh,
                        f"sudo chown -R {config.ssh_user}:{config.ssh_user} {config.template_deploy_path}",
                        progress,
                        sudo=True,
                        password=config.ssh_password
                    )
                
                progress.progress_percent = 25
                
                # Step 3: Transfer agent files
                progress.status = DeploymentStatus.TRANSFERRING_AGENT
                progress.current_step = "Transferring agent files..."
                progress.add_log("Creating agent package...")
                
                agent_package = self._create_agent_package(config)
                
                # Upload package
                remote_package_path = f"/tmp/agent_package_{deployment_id}.tar.gz"
                progress.add_log(f"Uploading agent package ({len(agent_package)} bytes)...")
                
                with sftp.file(remote_package_path, 'wb') as f:
                    f.write(agent_package)
                
                # Extract package
                progress.add_log("Extracting agent package...")
                self._exec_command(
                    ssh,
                    f"tar -xzf {remote_package_path} -C {config.agent_install_path}",
                    progress
                )
                self._exec_command(ssh, f"rm {remote_package_path}", progress)
                
                progress.progress_percent = 40
                
                # Step 4: Transfer template if specified
                if config.template_source_path and os.path.exists(config.template_source_path):
                    progress.status = DeploymentStatus.TRANSFERRING_TEMPLATE
                    progress.current_step = "Transferring template files..."
                    progress.add_log(f"Transferring template from {config.template_source_path}...")
                    
                    # Create template tar
                    template_buffer = io.BytesIO()
                    with tarfile.open(fileobj=template_buffer, mode='w:gz') as tar:
                        for item in os.listdir(config.template_source_path):
                            item_path = os.path.join(config.template_source_path, item)
                            tar.add(item_path, arcname=item)
                    
                    template_buffer.seek(0)
                    template_data = template_buffer.read()
                    
                    remote_template_path = f"/tmp/template_{deployment_id}.tar.gz"
                    progress.add_log(f"Uploading template ({len(template_data)} bytes)...")
                    
                    with sftp.file(remote_template_path, 'wb') as f:
                        f.write(template_data)
                    
                    self._exec_command(
                        ssh,
                        f"tar -xzf {remote_template_path} -C {config.template_deploy_path}/template",
                        progress
                    )
                    self._exec_command(ssh, f"rm {remote_template_path}", progress)
                
                progress.progress_percent = 55
                
                # Step 5: Create virtual environment and install dependencies
                progress.status = DeploymentStatus.INSTALLING_DEPENDENCIES
                progress.current_step = "Installing Python dependencies..."
                
                if config.create_venv:
                    progress.add_log("Creating Python virtual environment...")
                    self._exec_command(
                        ssh,
                        f"cd {config.agent_install_path} && python3 -m venv venv",
                        progress
                    )
                    
                    progress.add_log("Installing pip packages...")
                    exit_code, _, stderr = self._exec_command(
                        ssh,
                        f"cd {config.agent_install_path} && source venv/bin/activate && pip install -r requirements-agent.txt",
                        progress
                    )
                    
                    if exit_code != 0:
                        progress.add_log(f"Warning: Some packages may have failed to install")
                
                progress.progress_percent = 70
                
                # Step 6: Configure agent
                progress.status = DeploymentStatus.CONFIGURING_AGENT
                progress.current_step = "Configuring agent..."
                
                # Generate and upload .env file
                progress.add_log("Generating .env configuration...")
                env_content = self._generate_env_file(config)
                env_path = f"{config.agent_install_path}/.env"
                
                with sftp.file(env_path, 'w') as f:
                    f.write(env_content)
                
                # Generate config.toml
                progress.add_log("Generating config.toml...")
                config_toml = f"""[server]
port={config.manager_port}
[agent]
port={config.agent_port}
"""
                with sftp.file(f"{config.agent_install_path}/config.toml", 'w') as f:
                    f.write(config_toml)
                
                progress.progress_percent = 80
                
                # Step 7: Install systemd service
                progress.status = DeploymentStatus.INSTALLING_SERVICE
                progress.current_step = "Installing systemd service..."
                
                service_content = self._generate_service_file(config)
                service_tmp_path = f"/tmp/gpu-coder-agent.service"
                
                with sftp.file(service_tmp_path, 'w') as f:
                    f.write(service_content)
                
                progress.add_log("Installing service file...")
                self._exec_command(
                    ssh,
                    f"sudo mv {service_tmp_path} /etc/systemd/system/gpu-coder-agent.service",
                    progress,
                    sudo=True,
                    password=config.ssh_password
                )
                
                self._exec_command(
                    ssh,
                    "sudo systemctl daemon-reload",
                    progress,
                    sudo=True,
                    password=config.ssh_password
                )
                
                self._exec_command(
                    ssh,
                    "sudo systemctl enable gpu-coder-agent",
                    progress,
                    sudo=True,
                    password=config.ssh_password
                )
                
                progress.progress_percent = 90
                
                # Step 8: Start service
                progress.status = DeploymentStatus.STARTING_SERVICE
                progress.current_step = "Starting agent service..."
                
                self._exec_command(
                    ssh,
                    "sudo systemctl start gpu-coder-agent",
                    progress,
                    sudo=True,
                    password=config.ssh_password
                )
                
                # Wait a moment for service to start
                import time
                time.sleep(3)
                
                # Step 9: Verify
                progress.status = DeploymentStatus.VERIFYING
                progress.current_step = "Verifying deployment..."
                
                exit_code, stdout, _ = self._exec_command(
                    ssh,
                    "systemctl is-active gpu-coder-agent",
                    progress
                )
                
                if "active" in stdout:
                    progress.add_log("✓ Agent service is running")
                else:
                    progress.add_log("⚠ Agent service may not be running properly")
                    # Get service status for debugging
                    self._exec_command(
                        ssh,
                        "systemctl status gpu-coder-agent --no-pager -l",
                        progress
                    )
                
                # Test agent endpoint
                progress.add_log(f"Testing agent endpoint on port {config.agent_port}...")
                exit_code, stdout, _ = self._exec_command(
                    ssh,
                    f"curl -s http://localhost:{config.agent_port}/health || echo 'FAILED'",
                    progress
                )
                
                if "FAILED" not in stdout and exit_code == 0:
                    progress.add_log("✓ Agent health check passed")
                else:
                    progress.add_log("⚠ Agent health check failed - service may still be starting")
                
                sftp.close()
                ssh.close()
                
                progress.progress_percent = 100
                progress.status = DeploymentStatus.COMPLETED
                progress.current_step = "Deployment completed!"
                progress.completed_at = datetime.now().isoformat()
                progress.add_log("=" * 50)
                progress.add_log("Deployment completed successfully!")
                progress.add_log(f"Agent URL: http://{config.server_ip}:{config.agent_port}")
                
            except Exception as e:
                logger.error(f"Deployment failed: {e}")
                progress.status = DeploymentStatus.FAILED
                progress.error = str(e)
                progress.add_log(f"ERROR: {str(e)}")
            
            if callback:
                callback(progress)
        
        # Run deployment in background thread
        thread = threading.Thread(target=run_deployment)
        thread.daemon = True
        thread.start()
        
        return progress
    
    def get_deployment_status(self, deployment_id: str) -> Optional[DeploymentProgress]:
        """Get status of a deployment."""
        return self.deployments.get(deployment_id)
    
    def test_connection(self, server_ip: str, ssh_user: str, 
                       ssh_password: str, ssh_port: int = 22) -> Dict[str, Any]:
        """Test SSH connection to a server."""
        try:
            config = DeploymentConfig(
                server_ip=server_ip,
                ssh_user=ssh_user,
                ssh_password=ssh_password,
                ssh_port=ssh_port
            )
            
            ssh = self._get_ssh_client(config)
            
            # Get some basic info
            _, hostname, _ = ssh.exec_command("hostname")
            hostname = hostname.read().decode().strip()
            
            _, uname, _ = ssh.exec_command("uname -a")
            uname = uname.read().decode().strip()
            
            ssh.close()
            
            return {
                "success": True,
                "message": "Connection successful",
                "hostname": hostname,
                "system": uname
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }


# Singleton instance
agent_deploy_service = AgentDeployService()
