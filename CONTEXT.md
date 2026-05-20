# GPU Dev Container — Domain Glossary

## Core Concepts

**Admin** — The management service. Runs on the manager server. Owns the PostgreSQL database, serves the web UI (via nginx), and coordinates all Agents. There is exactly one Admin per deployment.

**Agent** — A lightweight service that runs on each compute server. Manages Docker containers on its host. Takes instructions from Admin over HTTP. Maintains its own SQLite port manager for assigning host ports to user containers. There is one Agent per compute host.

**User Container** — A per-user Docker container provisioned by an Agent. Contains Code Server (VS Code in browser) and Jupyter. Assigned a unique pair of host ports (Code port, Jupyter port) tracked by the Agent's port manager.

**Workspace** — The persistent directory on the host that backs a User Container. Templated from `WORKDIR_TEMPLATE` and deployed to `WORKDIR_DEPLOY`.

**Port Manager** — SQLite database local to each Agent. Tracks which host ports are allocated to which User Containers. Never shared with Admin.

**User Type** — Role assigned to a user: `regular`, `qvp`, or `admin`. Controls which features and containers a user can access.

**Admin Bootstrap** — First-run process that creates the default admin user from `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` in `.env`. Runs once if no admin user exists.

## Deployment Concepts

**Admin Stack** — Docker Compose stack for the manager server. Services: `postgres`, `backend` (Flask), `frontend` (nginx + React). Uses bridge networking; only the nginx port is exposed to the host.

**Agent Stack** — Docker Compose stack for each compute server. Single service: `agent` (Flask). Uses host networking so it can assign and bind arbitrary ports for User Containers.

**Host Home** — The host machine's home directory, mounted into the Admin backend container at runtime. Configurable via `HOST_HOME` in `.env`. Required for workspace provisioning.
