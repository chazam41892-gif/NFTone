# $LVTN ↔ NFTones Adapter — Reference Implementation

**Date:** 2026-05-11
**For:** $LVTN platform engineers (or whichever agent is wiring NFTones into `/opt/leviathantalon/server/`)

## Why this lives in the NFTones repo, not the $LVTN repo

Pragmatic reason: the live $LVTN Node app is being edited by other agents in this session. Per `fortune-500-upgrade-discipline`, I will NOT push files into a live production codebase that's actively crash-looping under another engineer's hands. So this is a **reference implementation** — the four TypeScript files that should land in `/opt/leviathantalon/server/integrations/nftones/` when the $LVTN team is ready.

Once integrated, this reference becomes the canonical source: changes here, then propagate. (The alternative — making the $LVTN repo the canonical source — also works; just pick one and document it.)

## What's in here

```
lvtn-adapter-reference/
├── README.md           ← you are here
└── src/
    ├── config.ts       Load NFTONES_* env vars; route content-type → service URL
    ├── client.ts       Typed REST client for embed/detect/health (the ONLY HTTP layer)
    ├── mount.ts        Express subrouter; one-line mount: mountNftones(app)
    └── webhooks.ts     HMAC-verified webhook receiver for NFTones → $LVTN events
```

Four files total. That's the entire $LVTN-side surface area for NFTones. Anti-corruption.

## Integration steps (when ready to land in `/opt/leviathantalon/`)

### 1. Drop the files in

```bash
mkdir -p /opt/leviathantalon/server/integrations/nftones
cp NFTones/lvtn-adapter-reference/src/{config,client,mount,webhooks}.ts \
   /opt/leviathantalon/server/integrations/nftones/
```

### 2. Install dependencies (only if not already present)

```bash
cd /opt/leviathantalon && npm install multer @types/multer
```

The rest (`express`, fetch via global, `crypto`) is in stdlib or already present.

### 3. Mount in `server/index.ts` — ONE LINE

Find the section where other integrations are mounted (search `app.use('/api/`). Add:

```typescript
import { mountNftones } from './integrations/nftones/mount';
import { nftonesWebhookHandler } from './integrations/nftones/webhooks';
import express from 'express';

// ... after auth middleware is in place:
mountNftones(app); // /api/nftones/*

// webhook needs the raw body for HMAC verification:
app.post('/api/nftones/webhook',
  express.raw({ type: 'application/json' }),
  nftonesWebhookHandler);
```

### 4. Add env vars to `.env` (and the deployment secret store)

```bash
NFTONES_ENABLED=false                              # MASTER FLAG — defaults OFF for safety
NFTONES_AUDIO_BASE_URL=http://127.0.0.1:8500
NFTONES_VIDEO_BASE_URL=http://127.0.0.1:8501       # 503 until service ships
NFTONES_IMAGE_BASE_URL=http://127.0.0.1:8502       # 503 until service ships
NFTONES_DOCUMENT_BASE_URL=http://127.0.0.1:8503    # 503 until service ships
NFTONES_BEARER_TOKEN=                              # optional — only if NFTones services require auth
NFTONES_WEBHOOK_SECRET=<openssl rand -base64 32>   # required for webhook verification
NFTONES_UPLOAD_LIMIT_MB=500                        # multer limit
NFTONES_TIMEOUT_MS=120000                          # adapter→NFTones request timeout
```

### 5. Deploy with flag OFF

Per `fortune-500-upgrade-discipline` Phase 3 (ISOLATE) and Phase 4 (APPLY):

- The code is in place but `NFTONES_ENABLED=false` means every adapter route returns 503 immediately, NFTones services are never called, and the platform behaves exactly as it did before the deploy. **Byte-identical behavior** on all OTHER routes.
- This is the safest possible deploy: the code lands, gets exercised by being parsed and mounted at boot, and the flag stays OFF until you flip it.

### 6. Verify (Phase 5) — re-run baseline

```bash
# All existing routes should still 200 (or whatever they did before)
curl -s http://localhost:3708/api/health
curl -sI http://localhost:3708/download-widget.html

# New routes return honest 503 (flag off)
curl -s http://localhost:3708/api/nftones/health
# → 503 {"enabled":false,"reason":"NFTONES_ENABLED=false"}
```

If anything that worked before now doesn't → set `NFTONES_ENABLED=` (unset) → restart → file a bug. The flag-off mode must be byte-identical to pre-deploy behavior. That's the test.

### 7. Flip the flag — but only after NFTones services are deployed

```bash
NFTONES_ENABLED=true pm2 restart leviathantalon --update-env
```

Watch:
- `pm2 logs leviathantalon | grep nftones` — should show "adapter mounted at /api/nftones"
- `curl localhost:3708/api/nftones/health` — should show `{enabled: true, services: { audio: true|false, ... }}`
- Restart count — should NOT climb

## Auth — read carefully

The reference router uses `req.user.wallet` as the wallet binding for embedded watermarks. This means **your $LVTN auth middleware must already populate `req.user.wallet`** before requests reach the NFTones router. If it doesn't:

- **DO NOT** weaken this router by accepting wallets from request body — that lets any caller claim any wallet's purchase, which would forge watermarks.
- Instead, adapt the router to whatever your auth's user shape is (`req.session.address`, `req.auth.principal`, etc.).

The detect endpoint is currently unguarded by role — only mount it behind an admin/creator-only middleware in production, or scan results leak across creators.

## Rollback

If anything goes wrong after `NFTONES_ENABLED=true`:

```bash
# Soft rollback (no code change, instant):
NFTONES_ENABLED=false pm2 restart leviathantalon --update-env

# Hard rollback (file removal):
mv /opt/leviathantalon/server/integrations/nftones \
   /opt/leviathantalon/server/integrations/nftones._archive_$(date +%s)
# Remove the mountNftones line from server/index.ts.
# Restart.
```

The soft rollback is the F500 default. Hard rollback is only needed if there's a startup-time crash from the import itself.

## What this does NOT include

- **Real $KTRS metering hook** — the webhook receiver logs `compute.metered` events but doesn't yet call the platform's $KTRS debit function. Replace `handleNftonesEvent` body when wiring.
- **Real $LVTN value-router hook** — same shape; `lvtn.flow.recorded` is logged, not actioned.
- **Idempotency store for webhooks** — should dedupe by `event.id` against a Redis or DB set. Today the handler is best-effort idempotent (it just logs). Wire in production.
- **Rate limiting on `/api/nftones/embed`** — large file uploads should be throttled per wallet to prevent abuse. Use whatever the rest of $LVTN uses.

Each is a small follow-up commit, not a rewrite of this adapter.

## Tests

`tests/` is intentionally left for the $LVTN integration session — testing the adapter requires either (a) running a real NFTones service on localhost, or (b) mocking `fetch`. Both are fine; pick whichever matches the rest of the $LVTN test patterns.
