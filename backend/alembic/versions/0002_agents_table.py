"""Add agents table for DB-backed agent registry."""

from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS agents (
            id SERIAL PRIMARY KEY,
            ip_address TEXT NOT NULL UNIQUE,
            name TEXT,
            status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
            registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_agents_ip ON agents (ip_address)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS agents")
