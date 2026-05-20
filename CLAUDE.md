# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 6 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 7 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 8 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 9 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 10 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 11 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Rule 12 — Poll readiness, don't sleep

Never `sleep N && assume_ready`. Instead, poll a health endpoint or process signal with retries and a timeout:
```bash
for i in $(seq 1 30); do
    curl -sf http://localhost:8000/health && break
    sleep 2
done
```
A fixed sleep either wastes time or races. A retry loop is exact.

## Rule 13 — Idempotent initialization

Every init step must be safe to run twice. Check state before acting:
- Creating a venv? Check `[ ! -d venv ]` first.
- Writing an env var? Check the key doesn't already exist.
- Starting a service? Check if it's already running.

Idempotent scripts can be re-run without cleanup steps, which makes them reliable in CI and on-call.

## Rule 14 — Detect capabilities before configuring

Check what's available (GPU, disk, ports, tools) at the top of any setup flow. Accumulate errors, then fail once with the full list — don't fail mid-way through partial setup:
```bash
ERRORS=0
check_gpu  || ERRORS=$((ERRORS+1))
check_disk || ERRORS=$((ERRORS+1))
[ "$ERRORS" -gt 0 ] && exit 1
```
Apply capability results to choose configuration (e.g., GPU vs CPU compose overlays), not inline branching throughout the script.

## Rule 15 — Separate dev and deploy entry points

A local dev script (process manager, venv, hot-reload) and a Docker deploy script are different tools for different audiences. Don't try to unify them with flags — maintain two explicit scripts with a cross-reference comment at the top of each.

---

## Rule 16 — Docker Compose: all ports and paths via .env with defaults

Every externally relevant value in `docker-compose.yml` must use `${VAR:-default}` syntax so it can be overridden without editing the file. This includes ports, volume paths, credentials, and URLs:

```yaml
ports:
  - "${BACKEND_PORT:-8000}:8000"
volumes:
  - ${DATA_VOLUME:-./volumes/data}:/app/data
```

All volumes that hold persistent data (database, uploads, model cache) must be named volume paths configurable in `.env` — never hardcoded bind mounts inside the repo tree.

## Rule 17 — Docker on Linux: use extra_hosts for host networking

`localhost` inside a container resolves to the container itself, not the host. `host-gateway` is a Docker Compose directive — it is NOT a resolvable DNS name and cannot be used in URLs.

On Linux, map `host.docker.internal` explicitly:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Then use `http://host.docker.internal:<port>` in URLs. On Mac/Windows this mapping exists automatically; on Linux it requires the explicit `extra_hosts` entry. Apply this to any service that needs to reach a process on the host (e.g., Ollama, local databases).

## Rule 18 — Docker: healthchecks on all stateful services, depend on health not start

Every stateful service (database, backend API) needs a `healthcheck`. Downstream services must use `condition: service_healthy`, not the default `condition: service_started`:

```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
    interval: 5s
    timeout: 5s
    retries: 10

backend:
  depends_on:
    db:
      condition: service_healthy
```

`service_started` means the container process launched — not that it's accepting connections. Race conditions from using it are hard to debug. Always use `service_healthy`.

## Rule 19 — Shell scripts: canonical structure

Every shell script must follow this structure:

```bash
#!/bin/bash
# One-line description of purpose.
# Cross-reference the other entry point if one exists.
# Usage: ./script.sh [command]

set -e

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# Helpers
ok()     { echo -e "  ${GREEN}✔${NC} $1"; }
warn()   { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()   { echo -e "  ${RED}✘${NC} $1"; }
header() { echo -e "\n${BLUE}── $1 ──${NC}"; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

# Portable project root (works when script is sourced or called from any cwd)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions...

# Case dispatch — always last, always has a default catch-all
case "${1:-default}" in
    cmd) run_cmd ;;
    *)   show_help; exit 1 ;;
esac
```

Use `ok/warn/fail/header` consistently. Never use raw `echo` for status output.

## Rule 20 — Shell scripts: process management with PID files and pkill fallback

When launching background services with `nohup`:

```bash
nohup bash -c "cd '$DIR' && source venv/bin/activate && uvicorn main:app ..." \
    > "$DIR/service.log" 2>&1 &
echo $! > "$DIR/service.pid"
```

On stop, use the PID file but always add a `pkill` fallback for processes that outlive their PID file:

```bash
if [ -f "$DIR/service.pid" ]; then
    PID=$(cat "$DIR/service.pid")
    ps -p "$PID" >/dev/null 2>&1 && kill "$PID" 2>/dev/null || true
    rm -f "$DIR/service.pid"
fi
pkill -f "uvicorn main:app" 2>/dev/null || true
```

Use `|| true` so stop never exits non-zero when the process is already gone. Suppress browser-open on React dev server with `BROWSER=none`.

## Rule 21 — Setup scripts: accumulate prereq errors, check ports, populate .env idempotently

Prerequisite checks must accumulate all failures before exiting — never fail-fast mid-check:

```bash
ERRORS=0
check_docker || ERRORS=$((ERRORS+1))
check_disk   || ERRORS=$((ERRORS+1))
[ "$ERRORS" -gt 0 ] && exit 1
```

Port conflict detection must run before deploying — not discovered after containers fail to bind. Check disk space before pulling large images.

`.env` population must be idempotent: only write a key if it doesn't already exist:

```bash
ensure_env_var() {
    local key="$1" value="$2"
    grep -q "^${key}=" .env 2>/dev/null && return
    echo "${key}=${value}" >> .env
}
```

Never overwrite existing values — the user may have customized them.

## Rule 22 — CLI: credential resolution chain with persistent config file

Auth credentials for any CLI tool must resolve in this exact priority order:
1. Explicit CLI flag (`--token`, `--api-url`)
2. Environment variable (`TOOL_TOKEN`, `TOOL_API_URL`)
3. Persistent config file (`~/.toolname.json`, written on first login)
4. Interactive prompt (last resort, only at the terminal)

The config file must be `chmod 600` immediately after writing. Never prompt interactively if a non-interactive source provides the value. This lets the CLI work headlessly in CI via env vars while staying ergonomic for humans via the cached config.

## Rule 23 — CLI: Click structure patterns

For any multi-command CLI:

- Use Click `@group` + `@group.command()` for logical subcommand grouping (`ingest file`, `ingest git`, `workspaces list`).
- Define auth options once as a decorator that wraps commands, not repeated on every command.
- Mark auth options `hidden=True` so they don't clutter `--help` but remain available.
- Raise a single custom `APIError` from all API methods; catch it at the command boundary and call `sys.exit(1)` after printing the message. Never let raw exceptions surface to the user.
- `resolve_workspace()` must accept both integer ID and name string — users remember names, scripts use IDs.
- Use Rich (`rich.console.Console`) for all terminal output: tables, progress bars, live polling. Never use raw `print()` for user-facing output.
- For file uploads, use `requests-toolbelt`'s `MultipartEncoderMonitor` with a callback to drive a Rich progress bar — don't fake progress with fixed sleeps.
