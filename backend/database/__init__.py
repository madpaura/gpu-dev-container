"""Database package initialization and compatibility layer."""

from .config import DatabaseConfig
from .base import DatabaseManager
from .user_repository import UserRepository
from .session_repository import SessionRepository
from .audit_repository import AuditRepository
from .traffic_repository import TrafficRepository
from .registry_repository import RegistryRepository
from .project_repository import ProjectRepository, BuildHistoryRepository
from .agent_repository import AgentRepository


class UserDatabase:
    """
    Compatibility wrapper for the original UserDatabase class.
    
    This class maintains backward compatibility while delegating operations
    to the appropriate repository classes.
    """
    
    def __init__(self):
        """Initialize the UserDatabase with all repositories."""
        self.db_manager = DatabaseManager()
        self.user_repo = UserRepository()
        self.session_repo = SessionRepository()
        self.audit_repo = AuditRepository()
        self.traffic_repo = TrafficRepository()
    
    # Database initialization
    def initialize_database(self):
        """Create necessary tables if they don't exist."""
        return self.db_manager.initialize_database()
    
    # User operations - delegate to UserRepository
    def create_user(self, username_or_data, email=None, password=None):
        """Create a new user. Supports both old and new signatures."""
        # Handle old signature: create_user(username, email, password)
        if isinstance(username_or_data, str) and email is not None and password is not None:
            user_data = {
                'username': username_or_data,
                'email': email,
                'password': password,
                'is_admin': False,
                'is_approved': False,
                'metadata': {}
            }
        # Handle new signature: create_user(user_data)
        else:
            user_data = username_or_data
        
        # Create the user
        success = self.user_repo.create_user(user_data)
        if success:
            # Return the user_id for backward compatibility
            user = self.user_repo.get_user_by_email(user_data['email'])
            return user['id'] if user else None
        return None
    
    def get_user_by_username(self, username):
        """Get user by username."""
        return self.user_repo.get_user_by_username(username)
    
    def get_user_by_id(self, user_id):
        """Get user by ID."""
        return self.user_repo.get_user_by_id(user_id)
    
    def get_user_by_email(self, email):
        """Get user by email."""
        return self.user_repo.get_user_by_email(email)
    
    def delete_user_by_username(self, username):
        """Delete a user by their username."""
        return self.user_repo.delete_user_by_username(username)
    
    def update_user(self, user_id, update_data):
        """Update user information."""
        return self.user_repo.update_user(user_id, update_data)
    
    def verify_login(self, email, password):
        """Verify user login credentials."""
        return self.user_repo.verify_login(email, password)
    
    def get_pending_users(self):
        """Get users pending approval."""
        return self.user_repo.get_pending_users()
    
    def get_all_users(self, exclude_admin=True):
        """Get all users."""
        return self.user_repo.get_all_users(exclude_admin)
    
    # Session operations - delegate to SessionRepository
    def create_session(self, user_id, session_token, expires_at):
        """Create a new user session."""
        return self.session_repo.create_session(user_id, session_token, expires_at)
    
    def verify_session(self, session_token):
        """Verify a session token."""
        return self.session_repo.verify_session(session_token)
    
    def remove_session(self, session_token=None):
        """Remove a session by token."""
        return self.session_repo.remove_session(session_token)
    
    # Audit operations - delegate to AuditRepository
    def log_audit(self, user_id, action_type, action_details, ip_address):
        """Log user actions for audit."""
        return self.audit_repo.log_audit(user_id, action_type, action_details, ip_address)
    
    def log_audit_event(self, username, action_type, action_details, ip_address):
        """Log user actions for audit using username instead of user_id."""
        return self.audit_repo.log_audit_event(username, action_type, action_details, ip_address)
    
    def get_audit_logs(self, username=None, limit=100):
        """Get audit logs with optional username filter."""
        return self.audit_repo.get_audit_logs(username, limit)
    
    def clear_audit_logs(self):
        """Clear all audit logs from the database."""
        return self.audit_repo.clear_audit_logs()
    
    # Private methods for backward compatibility
    def _get_or_create_system_user(self):
        """Get or create a system user for audit logging."""
        return self.user_repo.get_or_create_system_user()
    
    def _get_connection(self):
        """Get a database connection."""
        return self.db_manager.get_connection()


# Export the main classes for easy importing
__all__ = [
    'DatabaseConfig',
    'DatabaseManager', 
    'UserRepository',
    'SessionRepository',
    'AuditRepository',
    'TrafficRepository',
    'RegistryRepository',
    'ProjectRepository',
    'BuildHistoryRepository',
    'AgentRepository',
    'UserDatabase'
]
