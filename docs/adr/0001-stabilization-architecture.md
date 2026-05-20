# ADR 0001 — Stabilization Architecture

**Date:** 2026-05-19  
**Status:** Accepted

## Context

The codebase had several instabilities: hardcoded credentials in compose files, MySQL with no migration tooling, no portable setup script, and no CLI for headless operations. A stabilization pass was needed.

## Decisions

### 1. PostgreSQL replaces MySQL; Alembic manages schema

MySQL was running outside of Docker with no migration history. We skip adding MySQL to compose and migrate directly to PostgreSQL + Alembic. Alembic runs `upgrade head` automatically in the container entrypoint before Flask starts.

**Why:** One clean landing state instead of two migrations. Alembic gives us versioned, reviewable schema changes going forward.

### 2. Admin stack uses bridge networking; Agent stack uses host networking

Admin services (postgres, backend, frontend) communicate over an internal bridge network. Only the nginx port is exposed to the host. The Agent keeps host networking because it must bind arbitrary host ports for User Containers.

**Why:** Bridge networking gives Admin container DNS and port isolation. Host networking for Agent is genuinely required for its port-assignment role — it cannot be changed without redesigning how User Container ports are managed.

### 3. Frontend served by nginx container; backend API proxied via `/api`

React is built into a static bundle served by nginx. Nginx proxies `/api/*` to the Flask backend. No `VITE_API_URL` baked into the build.

**Why:** Frontend image is portable across environments without rebuilds. One public port instead of two.

### 4. No `run.sh` — `setup.sh` is the single entry point

All deployment operations (deploy, down, logs, status, migrate) go through `setup.sh`. A separate `run.sh` was rejected because local dev without Docker requires managing host-path config and Docker socket access — the complexity isn't worth the benefit.

### 5. Admin credentials folded into `.env`

The separate `admin.env` file is eliminated. `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` move into the main `.env`.

**Why:** Two env files with overlapping concerns creates confusion. Three variables don't warrant a separate file.

### 6. Flask retained; FastAPI migration deferred

The 68KB `app.py` with 17 service modules is not rewritten as part of stabilization. FastAPI migration, if desired, is a separate future project.

**Why:** Stabilization means making what exists reliable. A framework rewrite during stabilization doubles the risk surface.

### 7. CLI uses JWT token caching (not API keys)

`gpu-dash login` calls the existing auth endpoint and caches the JWT token at `~/.gpu-dash.json`. API key infrastructure is deferred.

**Why:** JWT already exists. API keys require new backend surface area. The caching pattern (flag → env var → file → prompt) is sufficient for both interactive and headless use.
