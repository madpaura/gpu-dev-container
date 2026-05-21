"""
Configuration Validator

Validates all required configuration settings before the application starts.
Checks for:
- Required environment variables
- Valid file/directory paths
- Network connectivity to required services
- Database connectivity
"""

import os
import sys
from typing import Dict, List, Tuple, Optional
from loguru import logger


class ConfigValidationError(Exception):
    """Raised when configuration validation fails."""
    pass


class ConfigValidator:
    """Validates application configuration before startup."""
    
    def __init__(self):
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self._strict: bool = True
        
    def validate_all(self, strict: bool = True) -> bool:
        """
        Run all validation checks.
        
        Args:
            strict: If True, raise exception on errors. If False, just log warnings.
            
        Returns:
            True if all validations pass, False otherwise.
        """
        self.errors = []
        self.warnings = []
        self._strict = strict

        logger.info("=" * 60)
        logger.info("Starting Configuration Validation")
        logger.info("=" * 60)
        
        # Run all checks
        self._validate_required_env_vars()
        self._validate_directory_paths()
        self._validate_file_paths()
        self._validate_network_settings()
        self._validate_database_config()
        
        # Report results
        self._report_results()
        
        if self.errors:
            if strict:
                raise ConfigValidationError(
                    f"Configuration validation failed with {len(self.errors)} error(s). "
                    "Please fix the issues above before starting the application."
                )
            return False
        
        logger.success("Configuration validation passed!")
        logger.info("=" * 60)
        return True
    
    def _validate_required_env_vars(self):
        """Check that all required environment variables are set."""
        logger.info("Checking required environment variables...")
        
        required_vars = [
            ('MGMT_SERVER_IP', 'Management server IP address'),
            ('AGENT_PORT', 'Agent service port'),
            ('WORKDIR_DEPLOY', 'User workspace deployment directory'),
            ('WORKDIR_TEMPLATE', 'User workspace template directory'),
            ('NGINX_CONFIG_FILE', 'Nginx configuration file path'),
        ]
        
        optional_vars = [
            ('DOCKER_IMAGE', 'Docker image name'),
            ('DOCKER_TAG', 'Docker image tag'),
            ('DEFAULT_WORKSPACE', 'Default workspace path inside container'),
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
                self.warnings.append(f"Optional environment variable '{var_name}' ({description}) is not set")
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
                logger.debug(f"  ✓ {env_var}: {path}")
    
    def _validate_file_paths(self):
        """Validate that required files exist."""
        logger.info("Checking file paths...")
        
        file_checks = [
            ('NGINX_CONFIG_FILE', 'Nginx configuration file', True),
        ]
        
        for env_var, description, required in file_checks:
            path = os.getenv(env_var)
            if not path:
                continue  # Already reported in env var check
            
            # Check if parent directory exists
            parent_dir = os.path.dirname(path)
            if not os.path.exists(parent_dir):
                msg = f"Parent directory for '{path}' ({description}) does not exist: {parent_dir}"
                if required:
                    self.errors.append(msg)
                else:
                    self.warnings.append(msg)
                continue
            
            if not os.path.exists(path):
                # For nginx config, it might be created later, so just warn
                self.warnings.append(f"File '{path}' ({description}) does not exist yet")
            elif not os.path.isfile(path):
                self.errors.append(f"Path '{path}' ({description}) exists but is not a file")
            elif not os.access(path, os.R_OK | os.W_OK):
                self.errors.append(f"File '{path}' ({description}) is not readable/writable")
            else:
                logger.debug(f"  ✓ {env_var}: {path}")
    
    def _validate_network_settings(self):
        """Validate network-related settings."""
        logger.info("Checking network settings...")
        
        # Validate port numbers
        port_vars = [
            ('AGENT_PORT', 1, 65535),
            ('OPENCXL_SWITCH_PORT', 1, 65535),
            ('OPENCXL_FM_PORT', 1, 65535),
            ('OPENCXL_FM_UI_PORT', 1, 65535),
        ]
        
        for var_name, min_port, max_port in port_vars:
            value = os.getenv(var_name)
            if value:
                try:
                    port = int(value)
                    if not (min_port <= port <= max_port):
                        self.errors.append(f"Port '{var_name}' value {port} is out of valid range ({min_port}-{max_port})")
                    else:
                        logger.debug(f"  ✓ {var_name} = {port}")
                except ValueError:
                    self.errors.append(f"Port '{var_name}' value '{value}' is not a valid integer")
        
        # Validate IP address format
        ip_vars = ['MGMT_SERVER_IP']
        for var_name in ip_vars:
            value = os.getenv(var_name)
            if value:
                if not self._is_valid_ip_or_hostname(value):
                    self.warnings.append(f"'{var_name}' value '{value}' may not be a valid IP address or hostname")
                else:
                    logger.debug(f"  ✓ {var_name} = {value}")
    
    def _validate_database_config(self):
        """Validate database configuration."""
        logger.info("Checking database configuration...")

        db_vars = [
            'DB_HOST',
            'DB_USER',
            'DB_PASSWORD',
            'DB_NAME',
        ]

        missing_db_vars = []
        for var_name in db_vars:
            value = os.getenv(var_name)
            if not value:
                missing_db_vars.append(var_name)
            else:
                # Mask password in logs
                display_value = '***' if 'PASSWORD' in var_name else value
                logger.debug(f"  ✓ {var_name} = {display_value}")

        if missing_db_vars:
            self.warnings.append(f"Database variables not set: {', '.join(missing_db_vars)}. Using defaults or SQLite.")

        # Validate that critical passwords are not empty or default
        for var_name in ('ADMIN_PASSWORD', 'POSTGRES_PASSWORD'):
            value = os.getenv(var_name)
            if not value:
                self.errors.append(f"'{var_name}' is not set")
            elif value == 'changeme':
                msg = f"'{var_name}' is set to the default 'changeme' — use a secure password"
                if self._strict:
                    self.errors.append(msg)
                else:
                    self.warnings.append(msg)
    
    def _is_valid_ip_or_hostname(self, value: str) -> bool:
        """Check if value is a valid IP address or hostname."""
        import re
        
        # Check for valid IPv4
        ipv4_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
        if re.match(ipv4_pattern, value):
            parts = value.split('.')
            return all(0 <= int(part) <= 255 for part in parts)
        
        # Check for localhost
        if value in ('localhost', '127.0.0.1'):
            return True
        
        # Check for valid hostname (basic check)
        hostname_pattern = r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$'
        return bool(re.match(hostname_pattern, value))
    
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


def validate_config(strict: bool = True) -> bool:
    """
    Convenience function to validate configuration.
    
    Args:
        strict: If True, raise exception on errors. If False, just log and continue.
        
    Returns:
        True if validation passes, False otherwise.
    """
    validator = ConfigValidator()
    return validator.validate_all(strict=strict)


def validate_agent_config(strict: bool = True) -> bool:
    """
    Validate configuration specific to the agent service.
    
    Args:
        strict: If True, raise exception on errors.
        
    Returns:
        True if validation passes.
    """
    validator = ConfigValidator()
    validator.errors = []
    validator.warnings = []
    
    logger.info("=" * 60)
    logger.info("Starting Agent Configuration Validation")
    logger.info("=" * 60)
    
    # Agent-specific checks
    required_vars = [
        ('WORKDIR_DEPLOY', 'User workspace deployment directory'),
        ('WORKDIR_TEMPLATE', 'User workspace template directory'),
        ('DOCKER_IMAGE', 'Docker image name'),
        ('DOCKER_TAG', 'Docker image tag'),
    ]
    
    for var_name, description in required_vars:
        value = os.getenv(var_name)
        if not value:
            validator.errors.append(f"Required environment variable '{var_name}' ({description}) is not set")
        else:
            logger.debug(f"  ✓ {var_name} = {value}")
    
    # Check directories
    for env_var in ['WORKDIR_DEPLOY', 'WORKDIR_TEMPLATE']:
        path = os.getenv(env_var)
        if path:
            if not os.path.exists(path):
                validator.errors.append(f"Directory '{path}' ({env_var}) does not exist")
            elif not os.path.isdir(path):
                validator.errors.append(f"Path '{path}' ({env_var}) is not a directory")
            elif not os.access(path, os.R_OK | os.W_OK):
                validator.errors.append(f"Directory '{path}' ({env_var}) is not readable/writable")
            else:
                logger.debug(f"  ✓ {env_var}: {path}")
    
    # Check Docker availability
    try:
        import docker
        client = docker.from_env()
        client.ping()
        logger.debug("  ✓ Docker daemon is accessible")
    except Exception as e:
        validator.errors.append(f"Cannot connect to Docker daemon: {e}")
    
    validator._report_results()
    
    if validator.errors:
        if strict:
            raise ConfigValidationError(
                f"Agent configuration validation failed with {len(validator.errors)} error(s)."
            )
        return False
    
    logger.success("Agent configuration validation passed!")
    logger.info("=" * 60)
    return True


if __name__ == '__main__':
    # Run validation when script is executed directly
    from dotenv import load_dotenv
    load_dotenv()
    
    try:
        validate_config(strict=True)
        print("\n✅ All configuration checks passed!")
    except ConfigValidationError as e:
        print(f"\n❌ {e}")
        sys.exit(1)
