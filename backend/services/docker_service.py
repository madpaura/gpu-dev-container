import time
import os
from typing import List, Dict, Any, Optional
from loguru import logger

from database import UserDatabase, AgentRepository
from services.agent_service import AgentService
from models.docker import DockerImage, DockerImagesResponse, DockerImageDetailsResponse, DockerImagesRequest


class DockerService:

    def __init__(self, db: UserDatabase, agent_service: AgentService, agent_port: int):
        self.db = db
        self.agent_service = agent_service
        self.agent_port = agent_port
        self.agent_repo = AgentRepository()
    
    def get_docker_images(self, server_id: Optional[str] = None) -> Dict[str, Any]:
        try:
            # Get list of available agents
            agents = self.agent_repo.get_agent_ips()
            
            if server_id:
                # Convert server_id to IP if it's in format 'server-192-168-68-108'
                agent_ip = server_id
                if server_id.startswith('server-'):
                    # Extract IP from server ID format: server-192-168-68-108 -> 192.168.68.108
                    agent_ip = server_id.replace('server-', '').replace('-', '.')
                
                # Query specific server
                if agent_ip not in agents:
                    return {
                        'servers': [],
                        'total_servers': 0,
                        'error': f'Server not found: {agent_ip}',
                        'timestamp': time.time()
                    }
                
                result = self.agent_service.query_agent_docker_images(agent_ip, self.agent_port)
                if result:
                    return {
                        'servers': [result],
                        'total_servers': 1,
                        'timestamp': time.time()
                    }
                else:
                    return {
                        'servers': [],
                        'total_servers': 0,
                        'error': f'Failed to get Docker images from server {server_id}',
                        'timestamp': time.time()
                    }
            else:
                # Query all servers
                results = self.agent_service.query_multiple_agents_docker_images(agents, self.agent_port)
                
                return {
                    'servers': results,
                    'total_servers': len(results),
                    'timestamp': time.time()
                }
        
        except Exception as e:
            logger.error(f"Error getting Docker images: {e}")
            return {
                'servers': [],
                'total_servers': 0,
                'error': 'Internal server error',
                'timestamp': time.time()
            }
    
    def get_docker_image_details(self, server_id: str, image_id: str) -> Dict[str, Any]:
        try:
            agents = self.agent_repo.get_agent_ips()
            
            # Convert server_id to IP if it's in format 'server-192-168-68-108'
            agent_ip = server_id
            if server_id.startswith('server-'):
                agent_ip = server_id.replace('server-', '').replace('-', '.')
            
            if agent_ip not in agents:
                return {'error': f'Server not found: {agent_ip}'}
            
            # Query image details from specific server
            result = self.agent_service.query_agent_docker_image_details(agent_ip, image_id, self.agent_port)
            
            if result:
                return result
            else:
                return {
                    'error': f'Failed to get image details from server {server_id}'
                }
        
        except Exception as e:
            logger.error(f"Error getting Docker image details: {e}")
            return {'error': 'Internal server error'}
    
    def delete_docker_image(self, server_id: str, image_id: str, force: bool = False) -> Dict[str, Any]:
        """Delete a Docker image from a specific server."""
        try:
            agents = self.agent_repo.get_agent_ips()
            
            # Convert server_id to IP if it's in format 'server-192-168-68-108'
            agent_ip = server_id
            if server_id.startswith('server-'):
                agent_ip = server_id.replace('server-', '').replace('-', '.')
            
            if agent_ip not in agents:
                return {'success': False, 'error': f'Server not found: {agent_ip}'}
            
            # Call agent to delete image
            result = self.agent_service.delete_docker_image(agent_ip, image_id, self.agent_port, force)
            
            return result
        
        except Exception as e:
            logger.error(f"Error deleting Docker image: {e}")
            return {'success': False, 'error': 'Internal server error'}
    
    def get_servers_list(self) -> List[Dict[str, Any]]:
        """
        Get list of available servers for Docker images management.
        
        Returns:
            List[Dict[str, Any]]: List of available servers
        """
        try:
            # Get list of available agents
            agents = self.agent_repo.get_agent_ips()
            
            # Query servers for basic info
            servers_resources = self.agent_service.query_available_agents(agents, self.agent_port)
            
            # Create server list with status information
            servers_list = []
            resource_map = {res['server_id']: res for res in servers_resources}
            
            for agent_ip in agents:
                if agent_ip in resource_map:
                    # Server is online
                    servers_list.append({
                        'id': agent_ip,
                        'name': f'Server {agent_ip}',
                        'ip': agent_ip,
                        'status': 'online',
                        'containers': resource_map[agent_ip].get('running_containers', 0)
                    })
                else:
                    # Server is offline
                    servers_list.append({
                        'id': agent_ip,
                        'name': f'Server {agent_ip}',
                        'ip': agent_ip,
                        'status': 'offline',
                        'containers': 0
                    })
            
            return servers_list
        
        except Exception as e:
            logger.error(f"Error getting servers list: {e}")
            return []
    
    def get_docker_statistics(self) -> Dict[str, Any]:
        """
        Get Docker statistics across all servers.
        
        Returns:
            Dict[str, Any]: Docker statistics
        """
        try:
            # Get Docker images from all servers
            images_data = self.get_docker_images()
            
            total_images = 0
            total_size = 0
            servers_with_docker = 0
            
            for server_data in images_data.get('servers', []):
                if 'images' in server_data:
                    server_images = server_data['images']
                    total_images += len(server_images)
                    servers_with_docker += 1
                    
                    # Calculate total size
                    for image in server_images:
                        total_size += image.get('size', 0)
            
            return {
                'total_images': total_images,
                'total_size': total_size,
                'servers_with_docker': servers_with_docker,
                'total_servers': len(self.agent_repo.get_agent_ips())
            }
        
        except Exception as e:
            logger.error(f"Error getting Docker statistics: {e}")
            return {
                'total_images': 0,
                'total_size': 0,
                'servers_with_docker': 0,
                'total_servers': 0
            }
    
    def search_docker_images(self, query: str, server_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Search Docker images across servers.
        
        Args:
            query: Search query
            server_id: Specific server ID to search, or None for all servers
            
        Returns:
            Dict[str, Any]: Search results
        """
        try:
            # Get all Docker images
            images_data = self.get_docker_images(server_id)
            
            # Filter images based on query
            filtered_servers = []
            for server_data in images_data.get('servers', []):
                if 'images' in server_data:
                    filtered_images = []
                    for image in server_data['images']:
                        # Search in repository, tag, and ID
                        if (query.lower() in image.get('repository', '').lower() or
                            query.lower() in image.get('tag', '').lower() or
                            query.lower() in image.get('id', '').lower()):
                            filtered_images.append(image)
                    
                    if filtered_images:
                        server_copy = server_data.copy()
                        server_copy['images'] = filtered_images
                        filtered_servers.append(server_copy)
            
            return {
                'servers': filtered_servers,
                'total_servers': len(filtered_servers),
                'query': query,
                'timestamp': time.time()
            }
        
        except Exception as e:
            logger.error(f"Error searching Docker images: {e}")
            return {
                'servers': [],
                'total_servers': 0,
                'query': query,
                'error': 'Search failed',
                'timestamp': time.time()
            }
    
    def get_image_history(self, server_id: str, image_id: str) -> Dict[str, Any]:
        """
        Get Docker image history and layers.
        
        Args:
            server_id: Server ID
            image_id: Docker image ID
            
        Returns:
            Dict[str, Any]: Image history and layers
        """
        try:
            # Get detailed image information
            details = self.get_docker_image_details(server_id, image_id)
            
            if 'error' in details:
                return details
            
            # Extract history and layers information
            history = details.get('history', [])
            layers = details.get('layers', [])
            
            return {
                'success': True,
                'server_id': server_id,
                'image_id': image_id,
                'history': history,
                'layers': layers,
                'total_layers': len(layers),
                'total_history_entries': len(history)
            }
        
        except Exception as e:
            logger.error(f"Error getting image history: {e}")
            return {'error': 'Failed to get image history'}
    
    def cleanup_unused_images(self, server_id: str, admin_username: str, 
                            ip_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Cleanup unused Docker images on a server.
        Note: This is a placeholder for future implementation.
        
        Args:
            server_id: Server ID
            admin_username: Username of admin performing cleanup
            ip_address: Client IP address
            
        Returns:
            Dict[str, Any]: Cleanup result
        """
        try:
            # Log the cleanup action
            self.db.log_audit_event(
                username=admin_username,
                action_type='docker_cleanup',
                action_details={
                    'message': f'Docker cleanup initiated on server {server_id}',
                    'server_id': server_id,
                    'action': 'cleanup_unused_images'
                },
                ip_address=ip_address
            )
            
            # Placeholder for actual cleanup implementation
            return {
                'success': True,
                'message': f'Docker cleanup initiated on server {server_id}',
                'note': 'This is a placeholder implementation'
            }
        
        except Exception as e:
            logger.error(f"Error cleaning up Docker images: {e}")
            return {'success': False, 'error': 'Failed to cleanup Docker images'}
