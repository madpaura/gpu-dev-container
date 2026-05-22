"""
Agent Configuration Validator

Validates all required configuration settings before the agent starts.
"""

import os
import sys
from typing import List
from loguru import logger


class ConfigValidationError(Exception):
    """Raised when configuration validation fails."""
    pass


class AgentConfigValidator:
    """Validates agent configuration before startup."""
    
    def __init__(self):
        self.errors: List[str] = []
        self.warnings: List[str] = []
        
    def validate_all(self, strict: bool = True) -> bool:
        """
        Run all validation checks.
        
        Args:
            strict: If True, raise exception on errors.
            
        Returns:
            True if all validations pass, False otherwise.
        """
        self.errors = []
        self.warnings = []
        
        logger.info("=" * 60)
        logger.info("Starting Agent Configuration Validation")
        logger.info("=" * 60)
        
        # Run all checks
        self._validate_required_env_vars()
        self._validate_directory_paths()
        self._validate_docker()
        
        # Report results
        self._report_results()
        
        if self.errors:
            if strict:
                raise ConfigValidationError(
                    f"Agent configuration validation failed with {len(self.errors)} error(s). "
                    "Please fix the issues above before starting the agent."
                )
            return False
        
        logger.success("Agent configuration validation passed!")
        logger.info("=" * 60)
        return True
    
    def _validate_required_env_vars(self):
        """Check that all required environment variables are set."""
        logger.info("Checking required environment variables...")
        
        required_vars = [
            ('WORKDIR_DEPLOY', 'User workspace deployment directory'),
            ('WORKDIR_TEMPLATE', 'User workspace template directory'),
            ('DOCKER_IMAGE', 'Docker image name'),
            ('DOCKER_TAG', 'Docker image tag'),
        ]
        
        optional_vars = [
            ('AGENT_PORT', 'Agent service port'),
            ('DEFAULT_WORKSPACE', 'Default workspace path inside container'),
            ('WORKSPACE_MOUNT', 'Workspace mount path inside container'),
        ]
        
        for var_name, description in required_vars:
            value = os.getenv(var_name)
            if not value:
                self.errors.append(f"Required environment variable '{var_name}' ({description}) is not set")
            else:
                logger.debug(f"  ✓ {var_name} = {value}")
        
        for var_name, description in optional_vars:
            value = os.getenv(var_name)
            if not value:
                self.warnings.append(f"Optional environment variable '{var_name}' ({description}) is not set, using default")
            else:
                logger.debug(f"  ✓ {var_name} = {value}")
    
    def _validate_directory_paths(self):
        """Validate that required directories exist and are accessible."""
        logger.info("Checking directory paths...")
        
        directory_checks = [
            ('WORKDIR_DEPLOY', 'User workspace deployment directory', True),
            ('WORKDIR_TEMPLATE', 'User workspace template directory', True),
        ]
        
        for env_var, description, required in directory_checks:
            path = os.getenv(env_var)
            if not path:
                continue  # Already reported in env var check
                
            if not os.path.exists(path):
                msg = f"Directory '{path}' ({description}) does not exist"
                if required:
                    self.errors.append(msg)
                else:
                    self.warnings.append(msg)
            elif not os.path.isdir(path):
                self.errors.append(f"Path '{path}' ({description}) exists but is not a directory")
            elif not os.access(path, os.R_OK | os.W_OK):
                self.errors.append(f"Directory '{path}' ({description}) is not readable/writable")
            else:
                # List contents to verify it's accessible
                try:
                    contents = os.listdir(path)
                    logger.debug(f"  ✓ {env_var}: {path} ({len(contents)} items)")
                except PermissionError:
                    self.errors.append(f"Cannot list contents of '{path}' ({description})")
    
    def _validate_docker(self):
        """Validate Docker is available and image exists."""
        logger.info("Checking Docker configuration...")
        
        try:
            import docker
            client = docker.from_env()
            client.ping()
            logger.debug("  ✓ Docker daemon is accessible")
            
            # Check if the configured image exists
            image_name = os.getenv('DOCKER_IMAGE', '')
            image_tag = os.getenv('DOCKER_TAG', 'latest')
            
            if image_name:
                full_image = f"{image_name}:{image_tag}"
                try:
                    client.images.get(full_image)
                    logger.debug(f"  ✓ Docker image '{full_image}' is available")
                except docker.errors.ImageNotFound:
                    self.warnings.append(f"Docker image '{full_image}' not found locally (will be pulled on first use)")
            
            client.close()
            
        except docker.errors.DockerException as e:
            self.errors.append(f"Cannot connect to Docker daemon: {e}")
        except Exception as e:
            self.errors.append(f"Docker check failed: {e}")
    
    def _report_results(self):
        """Report validation results."""
        if self.warnings:
            logger.warning(f"Configuration Warnings ({len(self.warnings)}):")
            for warning in self.warnings:
                logger.warning(f"  ⚠ {warning}")
        
        if self.errors:
            logger.error(f"Configuration Errors ({len(self.errors)}):")
            for error in self.errors:
                logger.error(f"  ✗ {error}")


def validate_agent_config(strict: bool = True) -> bool:
    """
    Convenience function to validate agent configuration.
    
    Args:
        strict: If True, raise exception on errors.
        
    Returns:
        True if validation passes, False otherwise.
    """
    validator = AgentConfigValidator()
    return validator.validate_all(strict=strict)


if __name__ == '__main__':
    # Run validation when script is executed directly
    from dotenv import load_dotenv
    load_dotenv()
    
    try:
        validate_agent_config(strict=True)
        print("\n✅ All agent configuration checks passed!")
    except ConfigValidationError as e:
        print(f"\n❌ {e}")
        sys.exit(1)
