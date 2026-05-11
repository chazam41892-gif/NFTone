# NFTones — API & Event Model

REST + WebSocket. Auth is wallet-signature based (sign a nonce, exchange for a session JWT). All compute-bearing endpoints debit $KTRS and return the cost in the response envelope.

## Conventions

- Base path: `/api/v1`
- All responses wrap data: `{ "ok": true, "data": ..., "cost_ktrs": "0.42" }` or `{ "ok": false, "error": { "code": "...", "message": "..." } }`
- Idempotency via `Idempotency-Key` header on POSTs that spend tokens.
- Pagination: `?cursor=<opaque>&limit=50`.

## REST

### Releases

| Method | Path                                  | Purpose                              | Cost |
| ------ | ------------------------------------- | ------------------------------------ | ---- |
| POST   | `/releases`                           | Register release (uploads master, anchors) | $KTRS |
| GET    | `/releases`                           | List my releases                     | free |
| GET    | `/releases/:id`                       | Detail                               | free |
| POST   | `/releases/:id/revoke`                | Mark revoked (no future renders)     | small $KTRS |

### Access

| Method | Path                                  | Purpose                              | Cost |
| ------ | ------------------------------------- | ------------------------------------ | ---- |
| POST   | `/releases/:id/access`                | Mint access NFT(s) to wallet list    | $KTRS per wallet |
| GET    | `/releases/:id/access`                | List grants                          | free |
| POST   | `/access/:grant_id/revoke`            | Revoke single grant                  | small $KTRS |

### Renders

| Method | Path                                  | Purpose                              | Cost |
| ------ | ------------------------------------- | ------------------------------------ | ---- |
| POST   | `/access/:grant_id/render`            | Trigger render (auto on first stream) | $KTRS |
| GET    | `/renders/:id`                        | Status + signed URL (holder only)    | free |

### Leak-check

| Method | Path                                  | Purpose                              | Cost |
| ------ | ------------------------------------- | ------------------------------------ | ---- |
| POST   | `/scans`                              | Upload suspect file, queue scan      | $KTRS |
| GET    | `/scans/:id`                          | Scan status / result                 | free |
| POST   | `/scans/:id/evidence`                 | Generate signed evidence report      | $KTRS + anchor fee |
| GET    | `/evidence/:id`                       | Fetch report (creator-private)       | free |

### Token

| Method | Path                                  | Purpose                              |
| ------ | ------------------------------------- | ------------------------------------ |
| GET    | `/token/balance`                      | $KTRS + $LVTN balances               |
| GET    | `/token/events`                       | Recent debits/credits                |

## WebSocket

`/ws` — authenticated, subscribes to:

- `release.registered`
- `access.minted` `{ release_id, wallet, watermark_id }`
- `render.completed` `{ render_id, render_hash }`
- `scan.progress` `{ scan_id, pct, layer }`
- `scan.matched` `{ scan_id, wallet, confidence }`
- `scan.nomatch` `{ scan_id }`
- `token.debit` / `token.credit`

## Worker events (internal queue)

Producer/consumer over Redis Streams (production) or in-memory (demo):

```
EMBED_REQUEST   { grant_id, master_uri, watermark_payload, layers }
EMBED_DONE      { grant_id, render_uri, render_hash, ktrs_used }
SCAN_REQUEST    { scan_id, input_uri, release_id }
SCAN_DONE       { scan_id, matched_wm_id?, confidence, log }
ANCHOR_REQUEST  { kind: "release"|"evidence", payload_hash }
ANCHOR_DONE     { tx_sig }
```

## On-chain calls

Anchor program instructions (Rust, sketch):

- `register_release(master_hash, fingerprint_uri, metadata_uri)`
- `mint_access(release, wallet, watermark_id_ref, tier)`
- `revoke_access(grant)`
- `anchor_evidence(release, report_hash, confidence)`

Off-chain backend signs and submits via a hot wallet whose authority is delegated by the creator's session signature. Creators can opt to sign locally (Phantom, Backpack) for register/revoke when they want full custody of authority.

## Error codes

| Code                  | HTTP | Meaning                                               |
| --------------------- | ---- | ----------------------------------------------------- |
| `INSUFFICIENT_KTRS`   | 402  | Wallet doesn't hold enough $KTRS for this action      |
| `RELEASE_REVOKED`     | 410  | Action blocked because release is revoked             |
| `WM_NOT_FOUND`        | 404  | Scan completed, no NFTones watermark detected         |
| `WM_LOW_CONFIDENCE`   | 200  | Match below threshold; returned with caveat flag      |
| `RATE_LIMITED`        | 429  | Per-wallet rate limit                                 |
| `UNAUTHORIZED`        | 401  | Session expired / signature invalid                   |
