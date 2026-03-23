# Docker Compose Production (Server + DB)

This guide uses the standard two-service Compose setup:

- `server` (Paperclip API + UI)
- `db` (PostgreSQL 17)

The default host port in this setup is `4100`.

## 1. Prerequisites

- Docker and Docker Compose installed
- Project directory available locally

## 2. Go to project root

```sh
cd /media/ctyun/datadisk1/projects/paperclip
```

## 3. Set required environment variables

`BETTER_AUTH_SECRET` is required by `docker-compose.yml`.

Generate a random secret:

```sh
openssl rand -hex 32
```

Export it (replace `<your-secret>`):

```sh
export BETTER_AUTH_SECRET="<your-secret>"
```

Optional (recommended when using a real domain):

```sh
export PAPERCLIP_PUBLIC_URL="http://localhost:4100"
```

## 4. Start services

```sh
docker compose up -d --build
```

## 5. Verify status

```sh
docker compose ps
docker compose logs --no-color server
```

Health checks:

```sh
curl http://localhost:4100/api/health
curl http://localhost:4100/api/companies
```

Expected:

- `/api/health` returns `{"status":"ok"}`
- `/api/companies` returns a JSON array (possibly empty)

## 6. Access from browser

Open:

- `http://localhost:4100`

## 7. Stop services

```sh
docker compose down
```

If you also want to remove named volumes (`pgdata`, `paperclip-data`):

```sh
docker compose down -v
```
