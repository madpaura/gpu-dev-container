import socket
import json
from loguru import logger
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from typing import List, Optional, Dict, Any

from models.server import ServerResources, AgentInfo
from models.docker import DockerImage, DockerImagesResponse, DockerImageDetailsResponse


class AgentService:
    
    def __init__(self, agent_port: int = 5000, timeout: int = 5):
        self.agent_port = agent_port
        self.timeout = timeout

    def query_agent_resources(self, agent_ip: str) -> Optional[Dict[str, Any]]:
        try:
            logger.debug(f"Querying resources from : {agent_ip} : {self.agent_port}")

            url = f"http://{agent_ip}:{self.agent_port}/get_resources"

            # Use shorter timeout for faster failure detection
            response = requests.get(url, timeout =self.timeout)
            if response.status_code == 200:
                logger.debug(f"Successfully queried resources from agent {agent_ip}:{self.agent_port}, response: {response.json()}")
                return response.json()
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                return None
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout querying agent {agent_ip}:{self.agent_port}")
            return None
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return None
        except Exception as e:
            logger.error(f"Error querying agent {agent_ip}:{self.agent_port}: {e}")
            return None

    def query_single_agent_with_id(self, agent_ip: str) -> Optional[Dict[str, Any]]:
        resources = self.query_agent_resources(agent_ip)
        if resources:
            resources["server_id"] = agent_ip
            return resources
        return None

    def query_available_agents(self, server_list: List[str], max_workers: int = 10, timeout_per_agent: int = None) -> List[Dict[str, Any]]:
        if timeout_per_agent is None:
            timeout_per_agent = self.timeout
            
        if not server_list:
            logger.warning("No servers provided to query")
            return []

        logger.debug(f"Querying {len(server_list)} agents concurrently with {max_workers} workers")
        
        available_agents = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_server = {
                executor.submit(self.query_single_agent_with_id, server_ip): server_ip 
                for server_ip in server_list
            }
            
            for future in as_completed(future_to_server):
                server_ip = future_to_server[future]
                try:
                    result = future.result(timeout=timeout_per_agent)
                    if result:
                        available_agents.append(result)
                        logger.debug(f"Successfully queried agent {server_ip}")
                    else:
                        logger.debug(f"Agent {server_ip} not available")
                except Exception as e:
                    logger.error(f"Error querying agent {server_ip}: {e}")
        
        logger.info(f"Successfully queried {len(available_agents)} out of {len(server_list)} agents")
        return available_agents

    def query_agent_docker_images(self, agent_ip: str, timeout: int = 10) -> Optional[Dict[str, Any]]:
        try:
            logger.debug(f"Querying Docker images from: {agent_ip}:{self.agent_port}")
            
            url = f"http://{agent_ip}:{self.agent_port}/get_docker_images"
            response = requests.get(url, timeout =self.timeout)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                return None
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout querying Docker images from agent {agent_ip}:{self.agent_port}")
            return None
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return None
        except Exception as e:
            logger.error(f"Error querying Docker images from agent {agent_ip}:{self.agent_port}: {e}")
            return None

    def query_agent_docker_image_details(self, agent_ip: str, image_id: str, timeout: int = 10) -> Optional[Dict[str, Any]]:
            
        try:
            logger.debug(f"Querying Docker image details for {image_id} from: {agent_ip}:{self.agent_port}")
            
            url = f"http://{agent_ip}:{self.agent_port}/get_docker_image_details/{image_id}"
            response = requests.get(url, timeout =self.timeout)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                return None
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout querying Docker image details from agent {agent_ip}:{self.agent_port}")
            return None
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return None
        except Exception as e:
            logger.error(f"Error querying Docker image details from agent {agent_ip}:{self.agent_port}: {e}")
            return None

    def delete_docker_image(self, agent_ip: str, image_id: str, port: int = None, force: bool = False) -> Dict[str, Any]:
        """Delete a Docker image from an agent."""
        try:
            logger.info(f"Deleting Docker image {image_id} from: {agent_ip}:{self.agent_port}")
            
            url = f"http://{agent_ip}:{self.agent_port}/delete_docker_image/{image_id}"
            response = requests.delete(url, json={'force': force}, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.json()
            else:
                error_msg = response.json().get('error', f'HTTP {response.status_code}')
                logger.warning(f"Failed to delete image from agent {agent_ip}: {error_msg}")
                return {'success': False, 'error': error_msg}
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout deleting Docker image from agent {agent_ip}:{self.agent_port}")
            return {'success': False, 'error': 'Request timeout'}
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return {'success': False, 'error': 'Connection failed'}
        except Exception as e:
            logger.error(f"Error deleting Docker image from agent {agent_ip}:{self.agent_port}: {e}")
            return {'success': False, 'error': str(e)}

    def query_multiple_agents_docker_images(self, server_list: List[str], port: int = None, max_workers: int = 10, timeout_per_agent: int = 10) -> List[Dict[str, Any]]:
        if not server_list:
            logger.warning("No servers provided to query for Docker images")
            return []

        logger.debug(f"Querying Docker images from {len(server_list)} agents concurrently")
        
        results = []
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_server = {
                executor.submit(self.query_agent_docker_images, server_ip, timeout_per_agent): server_ip 
                for server_ip in server_list
            }
            
            for future in as_completed(future_to_server):
                server_ip = future_to_server[future]
                try:
                    result = future.result(timeout=timeout_per_agent + 1)
                    if result:
                        result["server_id"] = server_ip
                        results.append(result)
                        logger.debug(f"Successfully queried Docker images from agent {server_ip}")
                    else:
                        logger.debug(f"Agent {server_ip} Docker images not available")
                except Exception as e:
                    logger.error(f"Error querying Docker images from agent {server_ip}: {e}")
        
        logger.info(f"Successfully queried Docker images from {len(results)} out of {len(server_list)} agents")
        return results

    def query_agent_container_status(self, agent_ip: str, container_name: str) -> Optional[Dict[str, Any]]:
        try:
            logger.debug(f"Querying container status for {container_name} from agent {agent_ip}:{self.agent_port}")
            
            url = f"http://{agent_ip}:{self.agent_port}/api/containers/{container_name}/status"
            
            response = requests.get(url, timeout =self.timeout)
            if response.status_code == 200:
                result = response.json()
                logger.debug(f"Container status response: {result}")
                return result
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                return None
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout querying container status from agent {agent_ip}:{self.agent_port}")
            return None
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return None
        except Exception as e:
            logger.error(f"Error querying container status from agent {agent_ip}:{self.agent_port}: {e}")
            return None

    def query_agent_port_info(self, agent_ip: str, container_name: str) -> Optional[Dict[str, Any]]:
        """Query port allocation info for a container from an agent."""
        try:
            logger.debug(f"Querying port info for {container_name} from agent {agent_ip}:{self.agent_port}")
            
            url = f"http://{agent_ip}:{self.agent_port}/api/containers/{container_name}/ports"
            
            response = requests.get(url, timeout=self.timeout)
            if response.status_code == 200:
                result = response.json()
                logger.debug(f"Port info response: {result}")
                return result
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                return None
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout querying port info from agent {agent_ip}:{self.agent_port}")
            return None
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return None
        except Exception as e:
            logger.error(f"Error querying port info from agent {agent_ip}:{self.agent_port}: {e}")
            return None

    def manage_user_container(self, agent_ip: str, container_name: str, action: str) -> Optional[Dict[str, Any]]:
        try:
            logger.debug(f"Managing container {container_name} with action {action} on agent {agent_ip}:{self.agent_port}")
            
            url = f"http://{agent_ip}:{self.agent_port}/api/containers/{container_name}/{action}"
            
            response = requests.post(url, timeout =self.timeout)
            if response.status_code == 200:
                result = response.json()
                logger.debug(f"Container {action} response: {result}")
                return result
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                return None
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout managing container on agent {agent_ip}:{self.agent_port}")
            return None
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return None
        except Exception as e:
            logger.error(f"Error managing container on agent {agent_ip}:{self.agent_port}: {e}")
            return None

    def recreate_user_container(self, agent_ip: str, container_name: str, wipe_data: bool = False) -> Optional[Dict[str, Any]]:
        """Recreate a user's container with optional data wipe.
        
        Args:
            agent_ip: IP address of the agent
            container_name: Name of the container
            wipe_data: If True, wipe user workspace data and start fresh
            
        Returns:
            Dict with success status and details, or None on failure
        """
        try:
            logger.debug(f"Recreating container {container_name} on agent {agent_ip}:{self.agent_port} (wipe_data={wipe_data})")
            
            url = f"http://{agent_ip}:{self.agent_port}/api/containers/{container_name}/recreate"
            
            response = requests.post(
                url, 
                json={'wipe_data': wipe_data},
                timeout=60  # Longer timeout for recreation
            )
            if response.status_code == 200:
                result = response.json()
                logger.debug(f"Container recreate response: {result}")
                return result
            else:
                logger.warning(f"Agent {agent_ip}:{self.agent_port} returned status code {response.status_code}")
                try:
                    error_data = response.json()
                    return error_data
                except:
                    return {'success': False, 'error': f'HTTP {response.status_code}'}
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout recreating container on agent {agent_ip}:{self.agent_port}")
            return {'success': False, 'error': 'Request timeout - recreation may still be in progress'}
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection failed to agent {agent_ip}:{self.agent_port}")
            return {'success': False, 'error': 'Connection failed to agent'}
        except Exception as e:
            logger.error(f"Error recreating container on agent {agent_ip}:{self.agent_port}: {e}")
            return {'success': False, 'error': str(e)}

# Global instance for backward compatibility
agent_service = AgentService()
