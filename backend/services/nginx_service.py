import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, Optional
from loguru import logger

nginx_path = Path(__file__).parent.parent / "nginx"
sys.path.insert(0, str(nginx_path))

from add_user import NginxUserManager

class NginxService:
    """Service for managing nginx routing for users."""
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file
        self.nginx_manager = NginxUserManager(self.config_file)
        print(self.config_file)

    def add_user_route(self, username: str, vscode_server: str, jupyter_server: str) -> Dict[str, Any]:
        """Add nginx routes for a new user."""
        result = {
            'success': False,
            'message': '',
            'routes_added': False,
            'nginx_reloaded': False
        }
        
        if not self.nginx_manager:
            result['message'] = 'Nginx integration not available'
            return result
        
        try:
            logger.info(f"Adding nginx routes for user {username}")
            
            # Update routes if user already exists, otherwise add new
            if self.nginx_manager.check_user_exists(username):
                if self.nginx_manager.update_user(username, vscode_server, jupyter_server):
                    result['success'] = True
                    result['routes_added'] = True
                    result['nginx_reloaded'] = True
                    result['message'] = f'Nginx routes updated for user {username}'
                else:
                    result['message'] = f'Failed to update nginx routes for user {username}'
                return result

            # Add user routes
            if self.nginx_manager.add_user(username, vscode_server, jupyter_server):
                result['success'] = True
                result['routes_added'] = True
                result['nginx_reloaded'] = True
                result['message'] = f'Nginx routes added successfully for user {username}'
                logger.success(f"Nginx routes added for user {username}")
            else:
                result['message'] = f'Failed to add nginx routes for user {username}'
                logger.error(f"Failed to add nginx routes for user {username}")
                
        except Exception as e:
            logger.error(f"Error adding nginx routes for user {username}: {e}")
            result['message'] = f'Error adding nginx routes: {str(e)}'
        
        return result
    
    def remove_user_route(self, username: str) -> Dict[str, Any]:
        """Remove nginx routes for a user."""
        result = {
            'success': False,
            'message': '',
            'routes_removed': False,
            'nginx_reloaded': False
        }
        
        if not self.nginx_manager:
            result['message'] = 'Nginx integration not available'
            return result
        
        try:
            logger.info(f"Removing nginx routes for user {username}")
            
            # Check if user exists
            if not self.nginx_manager.check_user_exists(username):
                result['message'] = f'User {username} does not have nginx routes configured'
                result['success'] = True
                result['routes_removed'] = True
                return result
            
            # Remove user routes
            if self.nginx_manager.remove_user(username):
                # Reload nginx configuration
                if self.nginx_manager.reload_nginx():
                    result['success'] = True
                    result['routes_removed'] = True
                    result['nginx_reloaded'] = True
                    result['message'] = f'Nginx routes removed successfully for user {username}'
                    logger.success(f"Nginx routes removed for user {username}")
                else:
                    result['routes_removed'] = True
                    result['message'] = f'Routes removed but nginx reload failed for user {username}'
                    logger.warning(f"Routes removed but nginx reload failed for user {username}")
            else:
                result['message'] = f'Failed to remove nginx routes for user {username}'
                logger.error(f"Failed to remove nginx routes for user {username}")
                
        except Exception as e:
            logger.error(f"Error removing nginx routes for user {username}: {e}")
            result['message'] = f'Error removing nginx routes: {str(e)}'
        
        return result
    
    def check_user_exists(self, username: str) -> bool:
        """Check if user has nginx routes configured."""
        if not self.nginx_manager:
            return False
        
        try:
            return self.nginx_manager.check_user_exists(username)
        except Exception as e:
            logger.error(f"Error checking if user {username} exists in nginx config: {e}")
            return False
    
    def list_configured_users(self) -> Dict[str, Any]:
        """List all users configured in nginx."""
        result = {
            'success': False,
            'users': []
        }
        
        if not self.nginx_manager:
            result['message'] = 'Nginx integration not available'
            return result
        
        try:
            # Read nginx config and extract users
            import re
            
            if not os.path.exists(self.config_file):
                result['message'] = f'Nginx config file not found: {self.config_file}'
                return result
            
            with open(self.config_file, 'r') as f:
                content = f.read()
            
            # Find all upstream blocks
            vscode_pattern = r'upstream vscode_(\w+)'
            jupyter_pattern = r'upstream jupyter_(\w+)'
            
            vscode_users = set(re.findall(vscode_pattern, content))
            jupyter_users = set(re.findall(jupyter_pattern, content))
            
            all_users = vscode_users.union(jupyter_users)
            
            users_info = []
            for user in sorted(all_users):
                has_vscode = user in vscode_users
                has_jupyter = user in jupyter_users
                services = []
                if has_vscode:
                    services.append("VSCode")
                if has_jupyter:
                    services.append("Jupyter")
                
                users_info.append({
                    'username': user,
                    'services': services,
                    'has_vscode': has_vscode,
                    'has_jupyter': has_jupyter
                })
            
            result['success'] = True
            result['users'] = users_info
            result['message'] = f'Found {len(users_info)} users configured in nginx'
            
        except Exception as e:
            logger.error(f"Error listing nginx users: {e}")
            result['message'] = f'Error listing users: {str(e)}'
        
        return result
    
    def get_user_routes_info(self, username: str) -> Dict[str, Any]:
        """Get routing information for a specific user."""
        result = {
            'success': False,
            'username': username,
            'has_routes': False,
            'vscode_url': None,
            'jupyter_url': None
        }
        
        if not self.nginx_manager:
            result['message'] = 'Nginx integration not available'
            return result
        
        try:
            if self.check_user_exists(username):
                result['success'] = True
                result['has_routes'] = True
                result['vscode_url'] = f"/user/{username}/vscode/"
                result['jupyter_url'] = f"/user/{username}/jupyter/"
                result['message'] = f'User {username} has nginx routes configured'
            else:
                result['success'] = True
                result['message'] = f'User {username} does not have nginx routes configured'
                
        except Exception as e:
            logger.error(f"Error getting route info for user {username}: {e}")
            result['message'] = f'Error getting route info: {str(e)}'
        
        return result
    
    def generate_user_servers(self, username: str, server_ip: str, base_port: int = 8080) -> Dict[str, str]:
        """Generate VSCode and Jupyter server addresses for a user."""
        # For now, use sequential port allocation
        # In production, this should integrate with the port manager
        vscode_port = base_port
        jupyter_port = base_port + 1  # port offset: code=0, jupyter=1
        
        return {
            'vscode_server': f"{server_ip}:{vscode_port}",
            'jupyter_server': f"{server_ip}:{jupyter_port}"
        }
