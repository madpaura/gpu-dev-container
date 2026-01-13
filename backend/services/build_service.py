"""Service for Docker image build operations."""

import os
import re
import shutil
import subprocess
import tempfile
import threading
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
from loguru import logger
from database import ProjectRepository, BuildHistoryRepository, RegistryRepository, UserDatabase


class BuildService:
    """Service for managing Docker image builds."""
    
    def __init__(self):
        self.project_repo = ProjectRepository()
        self.build_repo = BuildHistoryRepository()
        self.registry_repo = RegistryRepository()
        self.db = UserDatabase()
        self._active_builds: Dict[int, threading.Thread] = {}
    
    # ==================== Project Management ====================
    
    def create_project(self, project_data: Dict[str, Any],
                      admin_username: str = "Admin",
                      ip_address: str = None) -> Dict[str, Any]:
        """Create a new build project."""
        try:
            # Validate required fields
            if not project_data.get('name'):
                return {'success': False, 'error': 'Project name is required'}
            if not project_data.get('repo_url'):
                return {'success': False, 'error': 'Repository URL is required'}
            
            project_id = self.project_repo.create_project(project_data)
            
            if project_id:
                # Log audit event
                self.db.log_audit_event(
                    admin_username,
                    'create_project',
                    {
                        'message': f'{admin_username} created build project {project_data["name"]}',
                        'project_name': project_data['name'],
                        'repo_url': project_data['repo_url']
                    },
                    ip_address
                )
                
                return {
                    'success': True,
                    'message': f'Project {project_data["name"]} created successfully',
                    'project_id': project_id
                }
            else:
                return {'success': False, 'error': 'Failed to create project'}
                
        except Exception as e:
            logger.error(f"Error creating project: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_project(self, project_id: int) -> Dict[str, Any]:
        """Get a project by ID."""
        try:
            project = self.project_repo.get_project_by_id(project_id)
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            return {'success': True, 'data': project}
        except Exception as e:
            logger.error(f"Error fetching project: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_all_projects(self, include_inactive: bool = False) -> Dict[str, Any]:
        """Get all projects."""
        try:
            projects = self.project_repo.get_all_projects(include_inactive)
            return {'success': True, 'data': {'projects': projects}}
        except Exception as e:
            logger.error(f"Error fetching projects: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_project(self, project_id: int, update_data: Dict[str, Any],
                      admin_username: str = "Admin",
                      ip_address: str = None) -> Dict[str, Any]:
        """Update a project."""
        try:
            project = self.project_repo.get_project_by_id(project_id)
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            if self.project_repo.update_project(project_id, update_data):
                # Log audit event
                self.db.log_audit_event(
                    admin_username,
                    'update_project',
                    {
                        'message': f'{admin_username} updated project {project["name"]}',
                        'project_id': project_id,
                        'updated_fields': list(update_data.keys())
                    },
                    ip_address
                )
                
                return {'success': True, 'message': 'Project updated successfully'}
            else:
                return {'success': False, 'error': 'Failed to update project'}
                
        except Exception as e:
            logger.error(f"Error updating project: {e}")
            return {'success': False, 'error': str(e)}
    
    def delete_project(self, project_id: int,
                      admin_username: str = "Admin",
                      ip_address: str = None) -> Dict[str, Any]:
        """Delete a project."""
        try:
            project = self.project_repo.get_project_by_id(project_id)
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            if self.project_repo.delete_project(project_id):
                # Log audit event
                self.db.log_audit_event(
                    admin_username,
                    'delete_project',
                    {
                        'message': f'{admin_username} deleted project {project["name"]}',
                        'project_name': project['name']
                    },
                    ip_address
                )
                
                return {'success': True, 'message': 'Project deleted successfully'}
            else:
                return {'success': False, 'error': 'Failed to delete project'}
                
        except Exception as e:
            logger.error(f"Error deleting project: {e}")
            return {'success': False, 'error': str(e)}
    
    # ==================== Dockerfile Operations ====================
    
    def get_dockerfile(self, project_id: int) -> Dict[str, Any]:
        """Fetch Dockerfile content from the git repository."""
        try:
            project = self.project_repo.get_project_with_credentials(project_id)
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            # Clone repo to temp directory and read Dockerfile
            with tempfile.TemporaryDirectory() as temp_dir:
                clone_result = self._clone_repo(
                    project['repo_url'],
                    project.get('repo_branch', 'main'),
                    project.get('git_pat'),
                    temp_dir
                )
                
                if not clone_result['success']:
                    return clone_result
                
                dockerfile_path = os.path.join(
                    temp_dir, 
                    project.get('dockerfile_path', 'Dockerfile')
                )
                
                if not os.path.exists(dockerfile_path):
                    return {'success': False, 'error': f'Dockerfile not found at {project.get("dockerfile_path", "Dockerfile")}'}
                
                with open(dockerfile_path, 'r') as f:
                    content = f.read()
                
                return {
                    'success': True,
                    'data': {
                        'content': content,
                        'path': project.get('dockerfile_path', 'Dockerfile')
                    }
                }
                
        except Exception as e:
            logger.error(f"Error fetching Dockerfile: {e}")
            return {'success': False, 'error': str(e)}
    
    def save_dockerfile(self, project_id: int, content: str,
                       commit_message: str = "Update Dockerfile",
                       admin_username: str = "Admin",
                       ip_address: str = None) -> Dict[str, Any]:
        """Save Dockerfile content and push to git repository."""
        try:
            project = self.project_repo.get_project_with_credentials(project_id)
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            if not project.get('repo_url'):
                return {'success': False, 'error': 'Git repository URL not configured for this project'}
            
            if not project.get('git_pat'):
                return {'success': False, 'error': 'Git PAT (Personal Access Token) not configured for this project. Please add a PAT in project settings to enable git commits.'}
            
            # Clone repo to temp directory
            with tempfile.TemporaryDirectory() as temp_dir:
                logger.info(f"Cloning repo {project['repo_url']} to {temp_dir}")
                clone_result = self._clone_repo(
                    project['repo_url'],
                    project.get('repo_branch', 'main'),
                    project.get('git_pat'),
                    temp_dir
                )
                
                if not clone_result['success']:
                    logger.error(f"Clone failed: {clone_result.get('error')}")
                    return clone_result
                
                dockerfile_path = os.path.join(
                    temp_dir,
                    project.get('dockerfile_path', 'Dockerfile')
                )
                
                # Write new content - handle root-level Dockerfile
                dockerfile_dir = os.path.dirname(dockerfile_path)
                if dockerfile_dir:
                    os.makedirs(dockerfile_dir, exist_ok=True)
                    
                with open(dockerfile_path, 'w') as f:
                    f.write(content)
                
                logger.info(f"Dockerfile written to {dockerfile_path}")
                
                # Commit and push
                push_result = self._commit_and_push(
                    temp_dir,
                    project.get('dockerfile_path', 'Dockerfile'),
                    commit_message,
                    project.get('git_pat'),
                    project.get('repo_url')
                )
                
                if push_result['success']:
                    logger.info(f"Successfully pushed Dockerfile changes for project {project['name']}")
                    # Log audit event
                    self.db.log_audit_event(
                        admin_username,
                        'update_dockerfile',
                        {
                            'message': f'{admin_username} updated Dockerfile for project {project["name"]}',
                            'project_id': project_id,
                            'commit_message': commit_message
                        },
                        ip_address
                    )
                else:
                    logger.error(f"Push failed: {push_result.get('error')}")
                
                return push_result
                
        except Exception as e:
            logger.error(f"Error saving Dockerfile: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}
    
    # ==================== Build Operations ====================
    
    def start_build(self, project_id: int, tag: str = None,
                   registry_id: int = None,
                   admin_username: str = "Admin",
                   user_id: int = None,
                   ip_address: str = None) -> Dict[str, Any]:
        """Start a Docker image build."""
        try:
            project = self.project_repo.get_project_with_credentials(project_id)
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            # Determine tag
            if not tag:
                tag = self._get_next_tag(project)
            
            # Use project's default registry if not specified
            if not registry_id:
                registry_id = project.get('default_registry_id')
            
            # Create build record
            build_data = {
                'project_id': project_id,
                'registry_id': registry_id,
                'tag': tag,
                'status': 'pending',
                'triggered_by': user_id
            }
            
            build_id = self.build_repo.create_build(build_data)
            if not build_id:
                return {'success': False, 'error': 'Failed to create build record'}
            
            # Log audit event
            self.db.log_audit_event(
                admin_username,
                'start_build',
                {
                    'message': f'{admin_username} started build for project {project["name"]} with tag {tag}',
                    'project_id': project_id,
                    'build_id': build_id,
                    'tag': tag
                },
                ip_address
            )
            
            # Start build in background thread
            build_thread = threading.Thread(
                target=self._run_build,
                args=(build_id, project, tag, registry_id)
            )
            build_thread.start()
            self._active_builds[build_id] = build_thread
            
            return {
                'success': True,
                'message': 'Build started',
                'build_id': build_id,
                'tag': tag
            }
            
        except Exception as e:
            logger.error(f"Error starting build: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_build_status(self, build_id: int) -> Dict[str, Any]:
        """Get the status of a build."""
        try:
            build = self.build_repo.get_build_by_id(build_id)
            if not build:
                return {'success': False, 'error': 'Build not found'}
            
            return {'success': True, 'data': build}
        except Exception as e:
            logger.error(f"Error fetching build status: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_build_logs(self, build_id: int) -> Dict[str, Any]:
        """Get logs for a build."""
        try:
            logs = self.build_repo.get_build_logs(build_id)
            return {'success': True, 'data': {'logs': logs or ''}}
        except Exception as e:
            logger.error(f"Error fetching build logs: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_project_builds(self, project_id: int, limit: int = 50) -> Dict[str, Any]:
        """Get build history for a project."""
        try:
            builds = self.build_repo.get_builds_by_project(project_id, limit)
            return {'success': True, 'data': {'builds': builds}}
        except Exception as e:
            logger.error(f"Error fetching project builds: {e}")
            return {'success': False, 'error': str(e)}
    
    # ==================== Push Operations ====================
    
    def push_image(self, build_id: int, registry_id: int = None,
                  admin_username: str = "Admin",
                  ip_address: str = None) -> Dict[str, Any]:
        """Push a built image to a registry."""
        try:
            build = self.build_repo.get_build_by_id(build_id)
            if not build:
                return {'success': False, 'error': 'Build not found'}
            
            if build['status'] != 'completed':
                return {'success': False, 'error': 'Build is not completed'}
            
            # Use build's registry or specified registry
            target_registry_id = registry_id or build.get('registry_id')
            if not target_registry_id:
                return {'success': False, 'error': 'No registry specified'}
            
            # Get registry credentials
            registry = self._get_registry_with_credentials(target_registry_id)
            if not registry:
                return {'success': False, 'error': 'Registry not found'}
            
            # Update build status
            self.build_repo.update_build_status(build_id, 'pushing')
            
            # Get project for image name
            project = self.project_repo.get_project_by_id(build['project_id'])
            image_name = project.get('image_name') or project['name'].lower().replace(' ', '-')
            
            # Push image
            push_result = self._push_to_registry(
                image_name,
                build['tag'],
                registry
            )
            
            if push_result['success']:
                self.build_repo.update_build_status(build_id, 'completed')
                
                # Log audit event
                self.db.log_audit_event(
                    admin_username,
                    'push_image',
                    {
                        'message': f'{admin_username} pushed image {image_name}:{build["tag"]} to {registry["name"]}',
                        'build_id': build_id,
                        'registry': registry['name']
                    },
                    ip_address
                )
                
                return {
                    'success': True,
                    'message': f'Image pushed to {registry["name"]} successfully'
                }
            else:
                self.build_repo.update_build_status(
                    build_id, 'failed',
                    error_message=push_result.get('error')
                )
                return push_result
                
        except Exception as e:
            logger.error(f"Error pushing image: {e}")
            return {'success': False, 'error': str(e)}
    
    # ==================== Private Helper Methods ====================
    
    def _get_next_tag(self, project: Dict[str, Any]) -> str:
        """Generate the next tag for a project."""
        if not project.get('auto_increment_tag'):
            return project.get('last_tag') or 'latest'
        
        last_tag = project.get('last_tag')
        
        # If no last tag, start with v1.0.0
        if not last_tag:
            return 'v1.0.0'
        
        # Try to parse semantic version
        match = re.match(r'v?(\d+)\.(\d+)\.(\d+)', last_tag)
        if match:
            major, minor, patch = map(int, match.groups())
            return f'v{major}.{minor}.{patch + 1}'
        
        # Try simple numeric version
        match = re.match(r'v?(\d+)', last_tag)
        if match:
            version = int(match.group(1))
            return f'v{version + 1}'
        
        # Default to timestamp-based tag
        return f'build-{datetime.now().strftime("%Y%m%d-%H%M%S")}'
    
    def _clone_repo(self, repo_url: str, branch: str, pat: str,
                   target_dir: str) -> Dict[str, Any]:
        """Clone a git repository.
        
        Supports GitHub, GitLab, and Bitbucket with PAT authentication.
        Handles both http:// and https:// URLs.
        
        For Bitbucket Server with Basic Auth disabled, uses Bearer token via http.extraHeader.
        """
        try:
            # Set environment to prevent git from prompting for credentials
            env = os.environ.copy()
            env['GIT_TERMINAL_PROMPT'] = '0'
            env['GIT_ASKPASS'] = ''
            
            # Determine if this is Bitbucket Server (self-hosted) vs Bitbucket Cloud
            is_bitbucket_server = (
                'bitbucket' in repo_url.lower() and 
                'bitbucket.org' not in repo_url.lower()
            )
            
            # Also detect by port - Bitbucket Server commonly uses ports like 7990, 7999, etc.
            import re
            port_match = re.search(r':(\d+)/', repo_url)
            if port_match:
                port = int(port_match.group(1))
                # Ports other than 80/443 typically indicate self-hosted
                if port not in (80, 443):
                    is_bitbucket_server = True
            
            if pat and is_bitbucket_server:
                # Bitbucket Server with HTTP Access Token
                # Use Bearer token authentication via http.extraHeader
                # This works when Basic Auth is disabled on Bitbucket Server
                logger.info(f"Using Bearer token authentication for Bitbucket Server: {repo_url}")
                cmd = [
                    'git', '-c', f'http.extraHeader=Authorization: Bearer {pat}',
                    'clone', '--depth', '1', f'--branch={branch}',
                    '--', repo_url, target_dir
                ]
            elif pat:
                # For other providers, embed PAT in URL
                if repo_url.startswith('https://'):
                    protocol = 'https://'
                elif repo_url.startswith('http://'):
                    protocol = 'http://'
                else:
                    protocol = None
                
                if protocol:
                    if 'github.com' in repo_url:
                        # GitHub: {protocol}{PAT}@github.com/...
                        repo_url = repo_url.replace(protocol, f'{protocol}{pat}@')
                    elif 'gitlab.com' in repo_url or 'gitlab' in repo_url.lower():
                        # GitLab: {protocol}oauth2:{PAT}@gitlab.com/...
                        repo_url = repo_url.replace(protocol, f'{protocol}oauth2:{pat}@')
                    elif 'bitbucket.org' in repo_url:
                        # Bitbucket Cloud: {protocol}x-token-auth:{PAT}@bitbucket.org/...
                        repo_url = repo_url.replace(protocol, f'{protocol}x-token-auth:{pat}@')
                    else:
                        # Generic git hosting - try using PAT as username
                        repo_url = repo_url.replace(protocol, f'{protocol}{pat}@')
                
                cmd = ['git', 'clone', '--depth', '1', '--branch', branch, repo_url, target_dir]
            else:
                # No PAT provided
                cmd = ['git', 'clone', '--depth', '1', '--branch', branch, repo_url, target_dir]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                env=env
            )
            
            if result.returncode != 0:
                # Sanitize error message to not expose PAT
                error_msg = result.stderr
                if pat:
                    error_msg = error_msg.replace(pat, '***')
                return {'success': False, 'error': f'Git clone failed: {error_msg}'}
            
            return {'success': True}
            
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Git clone timed out'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _commit_and_push(self, repo_dir: str, file_path: str,
                        commit_message: str, pat: str, repo_url: str = None) -> Dict[str, Any]:
        """Commit changes and push to remote.
        
        For Bitbucket Server with HTTP Access Tokens, uses Bearer auth via http.extraHeader.
        """
        try:
            # Configure git
            subprocess.run(['git', 'config', 'user.email', 'docker-builder@local'],
                          cwd=repo_dir, capture_output=True)
            subprocess.run(['git', 'config', 'user.name', 'Docker Builder'],
                          cwd=repo_dir, capture_output=True)
            
            # Add file
            subprocess.run(['git', 'add', file_path], cwd=repo_dir, capture_output=True)
            
            # Commit
            result = subprocess.run(
                ['git', 'commit', '-m', commit_message],
                cwd=repo_dir,
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0 and 'nothing to commit' not in result.stdout:
                error_msg = result.stderr
                if pat:
                    error_msg = error_msg.replace(pat, '***')
                return {'success': False, 'error': f'Git commit failed: {error_msg}'}
            
            # Determine if this is Bitbucket Server for push command
            is_bitbucket_server = False
            if repo_url:
                is_bitbucket_server = (
                    'bitbucket' in repo_url.lower() and 
                    'bitbucket.org' not in repo_url.lower()
                )
                # Also detect by port
                import re
                port_match = re.search(r':(\d+)/', repo_url)
                if port_match:
                    port = int(port_match.group(1))
                    if port not in (80, 443):
                        is_bitbucket_server = True
            
            # Push with appropriate authentication
            if pat and is_bitbucket_server:
                # Use Bearer token for Bitbucket Server
                result = subprocess.run(
                    ['git', '-c', f'http.extraHeader=Authorization: Bearer {pat}', 'push'],
                    cwd=repo_dir,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
            else:
                result = subprocess.run(
                    ['git', 'push'],
                    cwd=repo_dir,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
            
            if result.returncode != 0:
                # Sanitize error message to not expose PAT
                error_msg = result.stderr
                if pat:
                    error_msg = error_msg.replace(pat, '***')
                return {'success': False, 'error': f'Git push failed: {error_msg}'}
            
            return {'success': True, 'message': 'Changes pushed successfully'}
            
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Git push timed out'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _run_build(self, build_id: int, project: Dict[str, Any],
                  tag: str, registry_id: int = None):
        """Run the Docker build process (runs in background thread)."""
        temp_dir = None
        try:
            # Update status to cloning
            self.build_repo.update_build_status(build_id, 'cloning')
            self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Starting build...")
            
            # Clone repository
            temp_dir = tempfile.mkdtemp()
            self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Cloning repository...")
            
            clone_result = self._clone_repo(
                project['repo_url'],
                project.get('repo_branch', 'main'),
                project.get('git_pat'),
                temp_dir
            )
            
            if not clone_result['success']:
                self.build_repo.update_build_status(
                    build_id, 'failed',
                    error_message=clone_result.get('error'),
                    build_logs=f"Clone failed: {clone_result.get('error')}"
                )
                return
            
            # Get git commit hash
            try:
                result = subprocess.run(
                    ['git', 'rev-parse', 'HEAD'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True
                )
                git_commit = result.stdout.strip()[:12] if result.returncode == 0 else None
            except:
                git_commit = None
            
            # Update status to building
            self.build_repo.update_build_status(build_id, 'building')
            self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Building Docker image...")
            
            # Determine image name
            image_name = project.get('image_name') or project['name'].lower().replace(' ', '-')
            
            # Build context path
            build_context = os.path.join(temp_dir, project.get('build_context', '.'))
            dockerfile_path = os.path.join(temp_dir, project.get('dockerfile_path', 'Dockerfile'))
            
            # Build Docker image
            build_cmd = [
                'docker', 'build',
                '-t', f'{image_name}:{tag}',
                '-f', dockerfile_path,
                build_context
            ]
            
            process = subprocess.Popen(
                build_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )
            
            # Stream build output
            for line in process.stdout:
                self.build_repo.append_build_log(build_id, line.rstrip())
            
            process.wait()
            
            if process.returncode != 0:
                self.build_repo.update_build_status(
                    build_id, 'failed',
                    error_message='Docker build failed'
                )
                return
            
            self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Build completed successfully!")
            
            # Update project's last tag
            self.project_repo.update_last_tag(project['id'], tag)
            
            # If registry specified, push immediately
            if registry_id:
                self.build_repo.update_build_status(build_id, 'pushing')
                self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Pushing to registry...")
                
                registry = self._get_registry_with_credentials(registry_id)
                if registry:
                    push_result = self._push_to_registry(image_name, tag, registry)
                    if push_result['success']:
                        self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Push completed!")
                    else:
                        self.build_repo.append_build_log(build_id, f"[{datetime.now().isoformat()}] Push failed: {push_result.get('error')}")
            
            # Mark as completed
            self.build_repo.update_build_status(build_id, 'completed')
            
        except Exception as e:
            logger.error(f"Build error: {e}")
            self.build_repo.update_build_status(
                build_id, 'failed',
                error_message=str(e)
            )
        finally:
            # Cleanup temp directory
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                except:
                    pass
            
            # Remove from active builds
            if build_id in self._active_builds:
                del self._active_builds[build_id]
    
    def _push_to_registry(self, image_name: str, tag: str,
                         registry: Dict[str, Any]) -> Dict[str, Any]:
        """Push an image to a Docker registry."""
        try:
            registry_url = registry['url']
            if registry_url.startswith(('http://', 'https://')):
                registry_url = registry_url.split('://', 1)[1]
            
            # Login to registry if credentials provided
            if registry.get('username') and registry.get('password'):
                login_cmd = [
                    'docker', 'login',
                    '-u', registry['username'],
                    '-p', registry['password'],
                    registry_url
                ]
                result = subprocess.run(login_cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    return {'success': False, 'error': f'Registry login failed: {result.stderr}'}
            
            # Tag image for registry
            full_image_name = f'{registry_url}/{image_name}:{tag}'
            tag_cmd = ['docker', 'tag', f'{image_name}:{tag}', full_image_name]
            result = subprocess.run(tag_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                return {'success': False, 'error': f'Image tagging failed: {result.stderr}'}
            
            # Push image
            push_cmd = ['docker', 'push', full_image_name]
            result = subprocess.run(push_cmd, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                return {'success': False, 'error': f'Push failed: {result.stderr}'}
            
            return {'success': True, 'message': 'Image pushed successfully'}
            
        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Push timed out'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def _get_registry_with_credentials(self, registry_id: int) -> Optional[Dict[str, Any]]:
        """Get registry with actual credentials."""
        query = "SELECT * FROM registry_servers WHERE id = %s"
        conn = self.registry_repo.db_manager.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, (registry_id,))
            return cursor.fetchone()
        finally:
            cursor.close()
            conn.close()
