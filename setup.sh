#!/bin/bash
# setup.sh — GPU Dev Container deployment entry point.
# Usage: ./setup.sh [admin|agent] <command>
#   admin (default): deploy|down|logs <svc>|status|migrate|check
#   agent:           deploy|down|logs|status

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()     { echo -e "  ${GREEN}✔${NC} $1"; }
warn()   { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()   { echo -e "  ${RED}✘${NC} $1"; }
header() { echo -e "\n${BLUE}── $1 ──${NC}"; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_COMPOSE_FILE="$PROJECT_ROOT/docker-compose-admin.yml"
AGENT_COMPOSE_FILE="$PROJECT_ROOT/docker-compose-agent.yml"
COMPOSE_FILE="$ADMIN_COMPOSE_FILE"

# ── .env helpers ─────────────────────────────────────────────

ensure_env_var() {
    local key="$1" value="$2"
    grep -q "^${key}=" "$PROJECT_ROOT/.env" 2>/dev/null && return
    echo "${key}=${value}" >> "$PROJECT_ROOT/.env"
}

seed_env() {
    ensure_env_var "BACKEND_PORT"      "8500"
    ensure_env_var "FRONTEND_PORT"     "9000"
    ensure_env_var "POSTGRES_DB"       "gpu_dash"
    ensure_env_var "POSTGRES_USER"     "gpu_dash"
    ensure_env_var "POSTGRES_PASSWORD" "changeme"
    ensure_env_var "ADMIN_USERNAME"    "admin"
    ensure_env_var "ADMIN_PASSWORD"    "changeme"
    ensure_env_var "ADMIN_EMAIL"       "admin@example.com"
    ensure_env_var "HOST_HOME"         "${HOME}"
    ensure_env_var "HOST_OPT"          "/opt"
}

# ── Prereq checks ─────────────────────────────────────────────

cmd_check() {
    header "Checking Prerequisites"

    local ERRORS=0

    # Create .env from scratch if missing; then seed defaults
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        warn ".env not found — creating with defaults (edit before production)"
        touch "$PROJECT_ROOT/.env"
    fi
    seed_env

    # Load port values for checks
    local backend_port frontend_port
    backend_port=$(grep "^BACKEND_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
    backend_port="${backend_port:-8500}"
    frontend_port=$(grep "^FRONTEND_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
    frontend_port="${frontend_port:-9000}"

    # Docker installed
    if command_exists docker; then
        local ver
        ver=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
        ok "Docker ${ver}"
    else
        fail "Docker not found — install from https://docs.docker.com/get-docker/"
        ERRORS=$((ERRORS+1))
    fi

    # Docker Compose v2
    if docker compose version &>/dev/null; then
        local cver
        cver=$(docker compose version --short 2>/dev/null || echo "v2+")
        ok "Docker Compose ${cver}"
    else
        fail "Docker Compose v2 not found — run: mkdir -p ~/.docker/cli-plugins && curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose && chmod +x ~/.docker/cli-plugins/docker-compose"
        ERRORS=$((ERRORS+1))
    fi

    # Docker daemon
    if docker info &>/dev/null; then
        ok "Docker daemon running"
    else
        fail "Docker daemon not running — start Docker first"
        ERRORS=$((ERRORS+1))
    fi

    # Port availability
    header "Port Availability"
    for port_check in "${backend_port}:BACKEND_PORT" "${frontend_port}:FRONTEND_PORT"; do
        local port name
        port="${port_check%%:*}"
        name="${port_check##*:}"
        if ss -tlnp 2>/dev/null | grep -q ":${port} " || lsof -i ":${port}" &>/dev/null 2>&1; then
            warn "Port ${port} (${name}) is in use — change in .env or stop the conflicting service"
        else
            ok "Port ${port} (${name}) is free"
        fi
    done

    # Disk space (minimum 5 GB)
    header "Disk Space"
    local avail
    avail=$(df -BG "$PROJECT_ROOT" | tail -1 | awk '{print $4}' | tr -d 'G')
    if [ "${avail:-0}" -ge 5 ]; then
        ok "${avail}GB available"
    else
        fail "${avail}GB available — at least 5GB required"
        ERRORS=$((ERRORS+1))
    fi

    # GPU detection (informational only)
    header "GPU Detection (informational)"
    if command_exists nvidia-smi && nvidia-smi &>/dev/null; then
        local gpu
        gpu=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        ok "NVIDIA GPU found: ${gpu}"
    else
        warn "No NVIDIA GPU detected (GPU not required for admin stack)"
    fi

    echo ""
    if [ "$ERRORS" -gt 0 ]; then
        echo -e "${RED}Found ${ERRORS} blocking issue(s). Fix them before deploying.${NC}"
        exit 1
    else
        echo -e "${GREEN}All prerequisites met. Run './setup.sh deploy' to start.${NC}"
    fi
}

# ── Deploy ────────────────────────────────────────────────────

cmd_deploy() {
    cmd_check

    header "Deploying Admin Stack"

    # Ensure backend logs directory exists (idempotent)
    mkdir -p "$PROJECT_ROOT/backend/logs"

    # Ensure agents.txt exists as a file (Docker bind-mount creates a dir if missing)
    if [ ! -f "$PROJECT_ROOT/backend/agents.txt" ]; then
        touch "$PROJECT_ROOT/backend/agents.txt"
        ok "Created backend/agents.txt"
    fi

    # Refuse to deploy with default 'changeme' passwords
    local deploy_errors=0
    for pw_var in POSTGRES_PASSWORD ADMIN_PASSWORD SUDO_PASSWORD; do
        local pw_val
        pw_val=$(grep "^${pw_var}=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
        if [ "${pw_val}" = "changeme" ]; then
            fail "${pw_var} is set to 'changeme' — set a secure password in .env before deploying"
            deploy_errors=$((deploy_errors+1))
        fi
    done
    [ "$deploy_errors" -gt 0 ] && exit 1

    echo "Building and starting containers..."
    docker compose -f "$COMPOSE_FILE" build
    docker compose -f "$COMPOSE_FILE" up -d

    # Load backend port for health poll
    local backend_port
    backend_port=$(grep "^BACKEND_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
    backend_port="${backend_port:-8500}"

    local frontend_port
    frontend_port=$(grep "^FRONTEND_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
    frontend_port="${frontend_port:-9000}"

    header "Waiting for backend to be healthy"
    local healthy=0
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${backend_port}/health" &>/dev/null; then
            ok "Backend is healthy"
            healthy=1
            break
        fi
        sleep 2
    done

    if [ "$healthy" -eq 0 ]; then
        fail "Backend did not become healthy within 60 seconds"
        echo "  Check logs with: ./setup.sh logs backend"
        exit 1
    fi

    header "Deployment Complete"
    echo -e "  Frontend:    ${GREEN}http://localhost:${frontend_port}${NC}"
    echo -e "  Backend API: ${GREEN}http://localhost:${backend_port}${NC}"
    echo ""
    echo "  Useful commands:"
    echo "    ./setup.sh logs backend   # tail backend logs"
    echo "    ./setup.sh status         # show container health"
    echo "    ./setup.sh migrate        # run DB migrations"
    echo "    ./setup.sh down           # stop all containers"
}

# ── Agent Deploy ──────────────────────────────────────────────

cmd_agent_deploy() {
    header "Checking Prerequisites (Agent)"

    local ERRORS=0

    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        warn ".env not found — creating with defaults"
        touch "$PROJECT_ROOT/.env"
    fi
    seed_env

    if ! command_exists docker; then
        fail "Docker not found"; ERRORS=$((ERRORS+1))
    else
        ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"
    fi

    if ! docker compose version &>/dev/null; then
        fail "Docker Compose v2 not found"; ERRORS=$((ERRORS+1))
    else
        ok "Docker Compose v2"
    fi

    if ! docker info &>/dev/null; then
        fail "Docker daemon not running"; ERRORS=$((ERRORS+1))
    else
        ok "Docker daemon running"
    fi

    [ "$ERRORS" -gt 0 ] && { echo -e "${RED}Fix the above before deploying.${NC}"; exit 1; }

    local agent_port
    agent_port=$(grep "^AGENT_PORT=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d= -f2)
    agent_port="${agent_port:-8510}"

    header "Deploying Agent Stack"
    docker compose -f "$AGENT_COMPOSE_FILE" build
    docker compose -f "$AGENT_COMPOSE_FILE" up -d

    header "Waiting for agent to be healthy"
    local healthy=0
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${agent_port}/health" &>/dev/null; then
            ok "Agent is healthy"
            healthy=1
            break
        fi
        sleep 2
    done

    if [ "$healthy" -eq 0 ]; then
        fail "Agent did not become healthy within 60 seconds"
        echo "  Check logs with: ./setup.sh agent logs"
        exit 1
    fi

    header "Agent Deployment Complete"
    echo -e "  Agent API: ${GREEN}http://localhost:${agent_port}${NC}"
    echo ""
    echo "  Useful commands:"
    echo "    ./setup.sh agent logs     # tail agent logs"
    echo "    ./setup.sh agent status   # show agent container"
    echo "    ./setup.sh agent down     # stop agent"
}

cmd_agent_down() {
    header "Stopping Agent Stack"
    docker compose -f "$AGENT_COMPOSE_FILE" down
    ok "Agent stopped"
}

cmd_agent_logs() {
    docker compose -f "$AGENT_COMPOSE_FILE" logs -f agent
}

cmd_agent_status() {
    header "Agent Container Status"
    docker compose -f "$AGENT_COMPOSE_FILE" ps
}

# ── Down ──────────────────────────────────────────────────────

cmd_down() {
    header "Stopping Admin Stack"
    docker compose -f "$COMPOSE_FILE" down
    ok "All containers stopped"
}

# ── Logs ──────────────────────────────────────────────────────

cmd_logs() {
    local svc="${1:-}"
    if [ -z "$svc" ]; then
        echo "Usage: ./setup.sh logs <service>"
        echo "  Services: backend, frontend, postgres"
        exit 1
    fi
    docker compose -f "$COMPOSE_FILE" logs -f "$svc"
}

# ── Status ────────────────────────────────────────────────────

cmd_status() {
    header "Container Status"
    docker compose -f "$COMPOSE_FILE" ps
}

# ── Migrate ───────────────────────────────────────────────────

cmd_migrate() {
    header "Running Alembic Migrations"
    docker compose -f "$COMPOSE_FILE" exec backend python -m alembic upgrade head
    ok "Migrations applied"
}

# ── Help ──────────────────────────────────────────────────────

show_help() {
    echo "GPU Dev Container — Deployment Entry Point"
    echo ""
    echo "Usage: ./setup.sh [admin] <command>"
    echo "       ./setup.sh agent <command>"
    echo ""
    echo "  Admin stack (default):"
    echo "    deploy         Check prereqs, build, and start admin stack"
    echo "    down           Stop admin stack containers"
    echo "    logs <svc>     Tail logs (backend, frontend, postgres)"
    echo "    status         Show container health"
    echo "    migrate        Run alembic upgrade head in backend"
    echo "    check          Run prerequisite checks only"
    echo ""
    echo "  Agent stack (run on each compute host):"
    echo "    agent deploy   Build and start the agent"
    echo "    agent down     Stop the agent"
    echo "    agent logs     Tail agent logs"
    echo "    agent status   Show agent container status"
}

# ── Dispatch ──────────────────────────────────────────────────

case "${1:-help}" in
    agent)
        case "${2:-help}" in
            deploy) cmd_agent_deploy ;;
            down)   cmd_agent_down ;;
            logs)   cmd_agent_logs ;;
            status) cmd_agent_status ;;
            *)      show_help; exit 1 ;;
        esac
        ;;
    admin|deploy|down|logs|status|migrate|check)
        case "${1}" in
            admin)   shift; CMD="${1:-help}" ;;
            *)       CMD="${1}" ;;
        esac
        case "$CMD" in
            deploy)  cmd_deploy ;;
            down)    cmd_down ;;
            logs)    cmd_logs "${2:-}" ;;
            status)  cmd_status ;;
            migrate) cmd_migrate ;;
            check)   cmd_check ;;
            *)       show_help; exit 1 ;;
        esac
        ;;
    *)  show_help; exit 1 ;;
esac
