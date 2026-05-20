#!/bin/bash
set -e
cd /app
alembic upgrade head

# Seed agents.txt into DB if file exists (one-time migration)
if [ -f agents.txt ]; then
    python - <<'EOF'
import os
from database.agent_repository import AgentRepository

repo = AgentRepository()
with open("agents.txt") as f:
    for line in f:
        ip = line.strip()
        if ip:
            repo.register_agent(ip)
            print(f"Seeded agent: {ip}")
try:
    os.remove("agents.txt")
except OSError:
    pass  # read-only mount — seed ran, ignore
EOF
fi

exec python app.py
