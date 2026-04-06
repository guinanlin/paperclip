# Docker Compose (Server + DB)

This guide uses the standard two-service Compose setup:

- `server` (Paperclip API + UI)
- `db` (PostgreSQL 17)

The default host port in this setup is `4100`.

## Deployment mode (default in this file)

`docker-compose.yml` defaults to:

- `PAPERCLIP_DEPLOYMENT_MODE=local_trusted` — no human login (same spirit as a normal local dev install).
- `PAPERCLIP_LOCAL_TRUSTED_ALLOW_NON_LOOPBACK_BIND=true` — required so the process can bind `0.0.0.0` inside the container while Docker publishes port `4100`. Without this, the server would refuse `local_trusted` on non-loopback binds (see `doc/DEPLOYMENT-MODES.md`).

### Security (read this)

`local_trusted` means **implicit full board operator**: anyone who can reach the HTTP port can act as the board. Canonical `local_trusted` is loopback-only on the machine; in Docker you are explicitly opting into **non-loopback bind** so that `localhost:4100` works from the host.

- **OK** for a single-user machine where only you can reach `localhost` (or a trusted LAN you fully control).
- **Not OK** to expose to the public internet without switching to `authenticated` and proper auth.

To use login-required mode instead, set `PAPERCLIP_DEPLOYMENT_MODE=authenticated` and provide `BETTER_AUTH_SECRET` (see `doc/DEPLOYMENT-MODES.md`).

## 1. Prerequisites

- Docker and Docker Compose installed
- Project directory available locally

## 2. Go to project root

```sh
cd /media/ctyun/datadisk1/projects/paperclip
```

## 3. Host `projects` directory (bind mount)

Agent and project workspace configs often use **absolute paths** under your machine’s project root (for example `/media/ctyun/datadisk1/projects/bairun`). The Paperclip **server** process runs inside the container, so those paths must exist **inside** the container at the **same** paths.

By default, `docker-compose.yml` bind-mounts the whole host directory:

- Host: `/media/ctyun/datadisk1/projects`
- Container: `/media/ctyun/datadisk1/projects` (same path)

To use a different host root, set before `docker compose up`:

```sh
export PAPERCLIP_HOST_PROJECTS_ROOT="/your/host/projects"
```

**Permissions:** the image runs as user `node` (non-root). If tasks fail with `EACCES` when writing inside the mounted tree, align ownership or permissions on the host directory with the container uid/gid (often `1000:1000`), or adjust as needed for your system.

## 4. Environment variables

With the default `local_trusted` compose file, you do **not** need `BETTER_AUTH_SECRET`.

Optional:

```sh
export PAPERCLIP_PUBLIC_URL="http://localhost:4100"
```

If you switch the server to `authenticated`, set a strong secret:

```sh
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
```

## 5. Start services

```sh
docker compose up -d --build
```

## 6. Verify status

```sh
docker compose ps
docker compose logs --no-color server
```

Health check:

```sh
curl http://localhost:4100/api/health
```

Expected: `"status":"ok"` and `"deploymentMode":"local_trusted"` (when using the default compose).

## 7. Access from browser

Open:

- `http://localhost:4100`

## 8. Stop services

```sh
docker compose down
```

If you also want to remove named volumes (`pgdata`, `paperclip-data`):

```sh
docker compose down -v
```
