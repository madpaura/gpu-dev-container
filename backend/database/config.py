"""Database configuration management."""

import os
from typing import Dict


class DatabaseConfig:
    """Database configuration class that loads settings from environment variables."""

    def __init__(self):
        """Initialize database configuration from environment variables."""
        self.host = os.getenv('DB_HOST', '0.0.0.0')
        self.database = os.getenv('DB_NAME', 'user_auth_db')
        self.user = os.getenv('DB_USER', 'root')
        self.password = os.getenv('DB_PASSWORD', '12qwaszx')
        self.port = int(os.getenv('DB_PORT', 5432))

    def get_dsn(self) -> str:
        """Get database connection string."""
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

    def get_config(self) -> Dict:
        """Get database configuration dictionary (kept for compatibility)."""
        return {
            'host': self.host,
            'database': self.database,
            'user': self.user,
            'password': self.password,
            'port': self.port,
        }
