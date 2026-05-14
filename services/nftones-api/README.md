# nftones-api

FastAPI orchestrator for NFTones. Owns releases, wallets, grants, scans,
evidence, and token events. Read-only Phase-1 surface — seeds from the
frozen `mock-data/data.json` fixture into SQLite at first boot.

## Run locally (dev)

```bash
cd services/nftones-api
python -m venv .venv
. .venv/Scripts/activate    # Windows
# . .venv/bin/activate      # Unix
pip install -r requirements-dev.txt
uvicorn src.main:app --reload --port 8600
# open http://localhost:8600/docs
```

## Run with Docker

```bash
docker compose up --build
# Healthcheck: curl http://localhost:8600/api/v1/health
```

## Endpoints (Phase 1, all GET, free)

| Path | Returns |
|---|---|
| `/api/v1/health` | `{status: ok}` |
| `/api/v1/version` | service version + config flags |
| `/api/v1/releases` | list |
| `/api/v1/releases/:id` | detail |
| `/api/v1/releases/:id/access` | grants for release |
| `/api/v1/grants` | cross-release grants (additive — UI needs this) |
| `/api/v1/wallets` | wallet directory (additive) |
| `/api/v1/wallets/:id` | wallet detail |
| `/api/v1/scans` | leak-scan list |
| `/api/v1/scans/:id` | scan detail |
| `/api/v1/evidence` | evidence report list |
| `/api/v1/evidence/:id` | evidence report detail |
| `/api/v1/token/balance` | `{KTRS, LVTN}` |
| `/api/v1/token/events` | recent token events |

All responses wrap data per `docs/04-api-events.md`:

```json
{ "ok": true, "data": ..., "cost_ktrs": "0.00" }
```

## Tests

```bash
pytest -q
```

## Hetzner deploy (mirrors LeviathanTalon pattern)

```bash
# On the box, behind Caddy/nginx (TLS terminates there):
git pull
cd services/nftones-api
docker compose up -d --build
docker compose logs -f nftones_api
```

The container binds `127.0.0.1:8600` — your reverse proxy fronts it at
`api.nftones.<your-domain>` with TLS.

## What's NOT in this service (by phase)

- **Phase 5** — wallet-signature auth + JWT. The `NFTONES_AUTH_ENABLED`
  env var is wired but the auth middleware is not yet implemented. When it
  ships, Phase 1 deploys flip the flag to `true` and existing endpoints
  require a bearer token.
- **Phase 6** — POST handlers for scans/embed proxy to `audio_watermarker`
  via `NFTONES_WATERMARKER_URL`.
- **Phase 7** — Solana Anchor program calls for `register_release`,
  `mint_access`, `revoke_access`, `anchor_evidence`. Currently the fixture
  holds pre-anchored data; real on-chain writes wait on devnet deploy.
- **Phase 8** — Postgres migration via Alembic. SQLite is intentional for
  Phase 1 (zero infra).

## Rollback

```bash
docker compose down
# To remove all data:
docker volume rm nftones-api_nftones_api_data
```

Zero impact on the static-demo frontend (which reads `mock-data/data.js`
directly when `window.NFTONES_CONFIG.useApi === false`).
