"""Initial schema: all 9 tables.

Revision ID: 0001
Revises:
Create Date: 2026-05-19

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(256) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            is_admin BOOLEAN DEFAULT FALSE,
            is_approved BOOLEAN DEFAULT FALSE,
            user_type TEXT DEFAULT 'regular' CHECK (user_type IN ('regular', 'qvp', 'admin')),
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'system')),
            redirect_url VARCHAR(255),
            metadata JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL
        )
    """)

    # user_sessions
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            session_token VARCHAR(255) UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # audit_log
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            action_type VARCHAR(100) NOT NULL,
            action_details JSON,
            ip_address VARCHAR(45),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # user_access_logs
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_access_logs (
            id SERIAL PRIMARY KEY,
            user_id INT,
            session_token VARCHAR(255),
            ip_address VARCHAR(45) NOT NULL,
            user_agent TEXT,
            endpoint VARCHAR(255),
            method VARCHAR(10),
            status_code INT,
            access_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            session_start TIMESTAMP,
            session_end TIMESTAMP,
            duration_seconds INT,
            bytes_sent BIGINT DEFAULT 0,
            bytes_received BIGINT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_ual_user_id ON user_access_logs (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ual_ip_address ON user_access_logs (ip_address)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ual_access_time ON user_access_logs (access_time)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ual_session_token ON user_access_logs (session_token)")

    # password_reset_requests
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
            admin_id INT,
            completed_at TIMESTAMP NULL,
            reason TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_prr_status ON password_reset_requests (status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_prr_user_id ON password_reset_requests (user_id)")

    # registry_servers
    op.execute("""
        CREATE TABLE IF NOT EXISTS registry_servers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            url VARCHAR(255) NOT NULL,
            registry_type TEXT DEFAULT 'private' CHECK (registry_type IN ('docker_hub', 'private', 'gcr', 'ecr', 'acr', 'harbor')),
            username VARCHAR(100),
            password VARCHAR(255),
            is_default BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            metadata JSON,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_rs_name ON registry_servers (name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_rs_is_active ON registry_servers (is_active)")

    # build_projects
    op.execute("""
        CREATE TABLE IF NOT EXISTS build_projects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            repo_url VARCHAR(500) NOT NULL,
            repo_branch VARCHAR(100) DEFAULT 'main',
            dockerfile_path VARCHAR(255) DEFAULT 'Dockerfile',
            build_context VARCHAR(255) DEFAULT '.',
            git_pat VARCHAR(500),
            default_registry_id INT,
            image_name VARCHAR(255),
            auto_increment_tag BOOLEAN DEFAULT TRUE,
            last_tag VARCHAR(100),
            is_active BOOLEAN DEFAULT TRUE,
            metadata JSON,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (default_registry_id) REFERENCES registry_servers(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bp_name ON build_projects (name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bp_is_active ON build_projects (is_active)")

    # build_history
    op.execute("""
        CREATE TABLE IF NOT EXISTS build_history (
            id SERIAL PRIMARY KEY,
            project_id INT NOT NULL,
            registry_id INT,
            tag VARCHAR(100) NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'cloning', 'building', 'pushing', 'completed', 'failed')),
            build_logs TEXT,
            error_message TEXT,
            image_digest VARCHAR(255),
            image_size BIGINT,
            git_commit VARCHAR(100),
            triggered_by INT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            duration_seconds INT,
            metadata JSON,
            FOREIGN KEY (project_id) REFERENCES build_projects(id) ON DELETE CASCADE,
            FOREIGN KEY (registry_id) REFERENCES registry_servers(id) ON DELETE SET NULL,
            FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_bh_project_id ON build_history (project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bh_status ON build_history (status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bh_started_at ON build_history (started_at)")

    # upload_servers
    op.execute("""
        CREATE TABLE IF NOT EXISTS upload_servers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            ip_address VARCHAR(255) NOT NULL,
            port INT DEFAULT 22,
            protocol TEXT DEFAULT 'sftp' CHECK (protocol IN ('sftp', 'scp', 'local')),
            username VARCHAR(100),
            password VARCHAR(255),
            ssh_key TEXT,
            base_path VARCHAR(500) NOT NULL,
            version_file_path VARCHAR(500),
            is_active BOOLEAN DEFAULT TRUE,
            metadata JSON,
            created_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_us_name ON upload_servers (name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_us_is_active ON upload_servers (is_active)")

    # guest_os_uploads
    op.execute("""
        CREATE TABLE IF NOT EXISTS guest_os_uploads (
            id SERIAL PRIMARY KEY,
            server_id INT NOT NULL,
            image_name VARCHAR(100) NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) NOT NULL,
            file_size BIGINT,
            file_type VARCHAR(20),
            version VARCHAR(50) NOT NULL,
            checksum VARCHAR(128),
            changelog TEXT,
            status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'completed', 'failed')),
            error_message TEXT,
            uploaded_by INT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            metadata JSON,
            FOREIGN KEY (server_id) REFERENCES upload_servers(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_gou_server_id ON guest_os_uploads (server_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gou_image_name ON guest_os_uploads (image_name)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gou_status ON guest_os_uploads (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS guest_os_uploads")
    op.execute("DROP TABLE IF EXISTS upload_servers")
    op.execute("DROP TABLE IF EXISTS build_history")
    op.execute("DROP TABLE IF EXISTS build_projects")
    op.execute("DROP TABLE IF EXISTS registry_servers")
    op.execute("DROP TABLE IF EXISTS password_reset_requests")
    op.execute("DROP TABLE IF EXISTS user_access_logs")
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS user_sessions")
    op.execute("DROP TABLE IF EXISTS users")
