"""Database manager for user authentication system."""

import psycopg2
import psycopg2.pool
import psycopg2.extras
import logging
import os
from typing import Optional, Dict, Any
from .config import DatabaseConfig


class _PooledConnection:
    """Wraps a psycopg2 connection so that close() returns it to the pool."""

    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool

    def cursor(self, dictionary=False):
        if dictionary:
            return self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return self._conn.cursor()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        try:
            self._conn.rollback()
        except Exception:
            pass
        self._pool.putconn(self._conn)

    # Delegate any other attribute lookups to the real connection
    def __getattr__(self, name):
        return getattr(self._conn, name)


class DatabaseManager:
    """Singleton database manager with connection pooling."""

    _instance = None
    _pool = None

    def __new__(cls):
        """Ensure singleton instance."""
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._setup_connection_pool()
        return cls._instance

    @classmethod
    def _setup_connection_pool(cls):
        """Set up PostgreSQL connection pool."""
        if cls._pool is None:
            db_config = DatabaseConfig()
            cfg = db_config.get_config()
            print(f"Setting up database connection pool: {cfg}")
            max_conn = int(os.getenv('DB_POOL_MAX', 20))
            cls._pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=2,
                maxconn=max_conn,
                host=cfg['host'],
                database=cfg['database'],
                user=cfg['user'],
                password=cfg['password'],
                port=cfg['port'],
            )

    def get_connection(self):
        """Get a connection from the pool, retrying briefly if exhausted."""
        import time
        for attempt in range(10):
            try:
                conn = self._pool.getconn()
                return _PooledConnection(conn, self._pool)
            except psycopg2.pool.PoolError:
                if attempt == 9:
                    raise
                time.sleep(0.1)
        raise psycopg2.pool.PoolError("connection pool exhausted")

    def initialize_database(self):
        """Create default admin user if it doesn't exist (schema managed by Alembic)."""
        self._create_default_admin()

    def _create_default_admin(self):
        """Create default admin user if it doesn't exist."""
        from .user_repository import UserRepository
        from utils.helpers import hash_password

        user_repo = UserRepository()
        admin_user = user_repo.get_user_by_username('admin')

        if not admin_user:
            print("Creating default admin user...")
            admin_data = {
                'username': os.getenv('ADMIN_USERNAME'),
                'password': hash_password(os.getenv('ADMIN_PASSWORD')),
                'email': os.getenv('ADMIN_EMAIL'),
                'is_admin': True,
                'is_approved': True,
                'user_type': 'admin'
            }
            user_repo.create_user(admin_data)
            print("Default admin user created successfully")
