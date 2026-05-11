# NFTones — Standalone Module Boundaries

**Created:** 2026-05-11
**Repo:** `C:\Users\chaza\NFTones\`
**Origin zip:** `C:\Users\chaza\Leviathan-blockchain\nftones-module.zip` (preserved — Sage 4)
**Status:** Pre-integration. Static prototype + 5 design docs. Mock data only.

## Why this is its own repo (not vendored into LeviathanTalon)

User decision (2026-05-11): keep NFTones in its own top-level repo to avoid overloading the $LVTN platform. Same pattern Stripe uses for their dashboard, Vercel for their docs site — peer products that integrate via stable contracts, not by sharing a codebase.

Two payoffs:
1. **Future extraction is free.** When NFTones launches as "NFTones Studio" — its own product, its own brand, its own pricing — there is no untangle work. Repo already lives independently. Spin a separate deploy target the same day.
2. **Either side can ship without the other.** A bad NFTones change cannot crash the $LVTN platform. A $LVTN deploy cannot break NFTones. Two products, two release cadences.

## The public contract — the ONLY way $LVTN talks to NFTones

Anything NOT in this list is internal and may change without notice.

### REST API (NFTones exposes; $LVTN consumes)

Per `docs/04-api-events.md`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/releases` | Creator registers an audio/video release |
| GET | `/api/releases/:id` | Read release metadata |
| POST | `/api/access/grant` | Creator grants wallet access |
| GET | `/api/access/:wallet/:release` | Check a wallet's access |
| POST | `/api/render` | Generate watermarked derivative for a wallet |
| GET | `/api/render/:id` | Read render status / storage URI |
| POST | `/api/scan` | Submit suspected leak for watermark detection |
| GET | `/api/scan/:id` | Read scan result |
| GET | `/api/health` | Liveness |
| GET | `/api/version` | Build SHA + module version |

### Events emitted (over webhook or NATS — TBD)

Per `docs/04-api-events.md`:

- `release.created` — release ID, master hash, metadata hash
- `access.granted` — wallet, license type
- `watermark.assigned` — watermark ID, private mapping, receipt hash
- `audio.rendered` — storage URI, derivative hash
- `leak.scan.started` / `leak.scan.completed` — scan ID, match status, confidence
- `compute.metered` — $KTRS cost
- `lvtn.flow.recorded` — treasury / staking / liquidity allocation

### What $LVTN MAY do
- Call any documented REST endpoint above
- Subscribe to any documented event above
- Mount NFTones web UI at `lvtn.metanoiaunlimited.com/nftones/*` via nginx alias (static-only) OR reverse-proxy
- Render NFTones-branded buttons / links that deep-link to the studio

### What $LVTN MUST NOT do (anti-corruption layer)
- Import NFTones internal modules directly
- Read NFTones storage / database directly
- Write to NFTones storage / database directly
- Bypass the REST API to "get faster results" — performance issues are solved with caching at the boundary, not by reaching across it
- Mirror NFTones routes inside its own router (any NFTones surface lives in this repo only)

If any of those rules feels inconvenient, the module boundary is doing its job. Resist.

## What NFTones MUST NOT do back

- Import $LVTN modules
- Read $LVTN database
- Assume any specific deployment topology (NFTones must run in any environment with a Postgres + S3-compatible object store + Solana RPC)
- Hard-code `lvtn.metanoiaunlimited.com` anywhere — read from env: `NFTONES_HOST_PLATFORM`

## Adapter pattern (the bridge that lives in $LVTN)

In `/opt/leviathantalon/server/integrations/nftones/`:

```
nftones/
├── client.ts         REST client (typed wrappers — one per endpoint above)
├── webhooks.ts       Webhook receiver for NFTones events; translates to $LVTN's event bus
├── mount.ts          Express subrouter mounting /api/nftones/* (proxies) and /nftones/* (UI alias)
└── config.ts         Reads NFTONES_BASE_URL, NFTONES_API_KEY from env; defaults to localhost in dev
```

The adapter is the ONLY $LVTN file that touches NFTones. If the API contract changes, only `client.ts` changes. If the event names change, only `webhooks.ts` changes. Anti-corruption.

## Deploy topology (future, when services land)

Three legitimate deployment modes for NFTones — pick one when ready:

| Mode | NFTones lives at | Pros | Cons |
|---|---|---|---|
| **Co-resident** | `/opt/nftones/` on the same Hetzner box, separate Docker stack, separate port (e.g., `:8500`) | Cheap; one server to maintain | Shares fate with $LVTN host (disk, network, DDoS) |
| **Adjacent VM** | Separate Hetzner CX22 (~€4/mo); `nftones.metanoiaunlimited.com` via Cloudflare | Real isolation; can autoscale separately | Adds one server to manage |
| **Standalone product** | Own infra (Vercel/Fly/AWS); `nftones.studio` (own domain) | Full extraction; sellable as separate product | More setup; user-account split |

MVP target: **Co-resident**. When real traffic / paying users land, migrate to Adjacent VM. When NFTones Studio launches as its own product, migrate to Standalone.

The boundaries in this document are designed so all three transitions are zero-rewrite — only deploy config changes.

## What's needed to implement (separate plan, separate session)

The REST API endpoints exist as DOCS only. Real implementation needs:

1. **Persistence layer** — Postgres schema per `docs/03-data-model.md`
2. **Object store** — encrypted masters + per-wallet watermarked derivatives (S3-compatible)
3. **Worker queue** — watermark embedding + scan jobs (background, not request-time)
4. **Audio watermarker** — embed inaudible payload, recoverable after lossy re-encode
5. **Video watermarker** — same idea, harder problem (user mentioned video as well)
6. **Watermark detector** — search candidate leak for embedded payload
7. **Solana anchor program** — release registry + access NFT mint + receipt anchor
8. **$KTRS metering hook** — call platform's metering endpoint after each metered action
9. **$LVTN value router** — call platform's value-router endpoint after each protocol-share event

Each of those is a 1-3 day item. Sequence and parallelism go in a separate plan file once we choose what to ship first.

## Verification this module is still standalone (run before EVERY commit)

```bash
cd C:/Users/chaza/NFTones
# Verify static prototype still serves on its own:
python3 -m http.server 8000 &
curl -s http://localhost:8000/web/ | grep -c "NFTones"  # should print >0
kill %1

# Verify no implicit coupling — grep for forbidden imports:
grep -rE "leviathantalon|lvtn-platform|/opt/leviathantalon" . --exclude-dir=.git --exclude=MODULE_BOUNDARIES.md
# Output MUST be empty. If not, fix before commit.
```

If those two checks pass, the module is still self-contained. If they fail, the boundary has leaked — patch before pushing.

## Governance

- This file is the source of truth for module boundaries.
- Any change to the public REST API or event schema requires updating this file FIRST, then `docs/04-api-events.md`, then the adapter in $LVTN.
- Versioning: NFTones uses semver. The REST API path includes the major version (`/api/v1/releases`) — breaking changes get a `/api/v2/` and old `v1` lives until adapter migration ships. Strangler-fig pattern (per `fortune-500-upgrade-discipline`).
