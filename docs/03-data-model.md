# NFTones — Data Model

Two layers: **on-chain** (authoritative for ownership, immutable, public) and **off-chain controlled** (authoritative for audio bytes and watermark mappings, private, audited).

---

## On-chain (Solana)

### `Release` (Anchor program account)

| Field             | Type        | Notes                                              |
| ----------------- | ----------- | -------------------------------------------------- |
| `release_id`      | `Pubkey`    | PDA: `["release", creator, slug]`                  |
| `creator`         | `Pubkey`    | Wallet that owns the release                        |
| `master_hash`     | `[u8; 32]`  | BLAKE3 of canonicalized master                      |
| `fingerprint_uri` | `String`    | URI of perceptual-fingerprint blob in object store |
| `metadata_uri`    | `String`    | Off-chain JSON: title, artwork, credits            |
| `created_at`      | `i64`       | Unix seconds                                        |
| `revoked`         | `bool`      | Soft-delete flag                                    |
| `policy_version`  | `u8`        | For future fee/rule upgrades                        |

### `AccessNFT` (Metaplex Token Metadata)

Standard Metaplex NFT with custom collection. Off-chain metadata JSON adds:

```json
{
  "release_id": "<pda>",
  "watermark_id_ref": "wm_8f3a...",   // opaque pointer; not the payload
  "tier": "collaborator | reviewer | listener | label_admin",
  "minted_at": 1736000000,
  "render_status_uri": "https://api.nftones.lvtn/render-status/<id>"
}
```

Transfer history comes for free from Solana. Revocation is a separate on-chain action that flips a `revoked` flag in a per-NFT PDA; renderers honor it.

### `EvidenceAnchor`

Lightweight account written when an evidence report is finalized:

| Field           | Type       | Notes                                            |
| --------------- | ---------- | ------------------------------------------------ |
| `evidence_id`   | `Pubkey`   | PDA: `["evidence", release, scan_id]`            |
| `release_id`    | `Pubkey`   |                                                  |
| `report_hash`   | `[u8; 32]` | BLAKE3 of signed report blob                     |
| `confidence`    | `u8`       | 0–100                                            |
| `creator_sig`   | `[u8; 64]` | Creator-signed acknowledgement                   |
| `created_at`    | `i64`      |                                                  |

The wallet identified by the report is *not* written on-chain (privacy / defamation).

---

## Off-chain controlled (Postgres + object store)

### `releases`

```
release_id        text  PK    -- mirrors Solana PDA
creator_wallet    text
title             text
artist            text
slug              text
master_uri        text         -- bucket://masters/<id>.flac
master_hash       text         -- hex BLAKE3
fingerprint_uri   text
duration_sec      int
created_at        timestamptz
revoked           bool
```

### `wallets`

```
wallet            text  PK
display_name      text          -- creator-supplied label, optional
risk_score        int           -- 0..100, derived
verified          bool          -- $LVTN-stake verification
first_seen_at     timestamptz
```

### `access_grants`

```
grant_id          uuid  PK
release_id        text  FK -> releases
wallet            text  FK -> wallets
nft_mint          text          -- Solana mint address
tier              text
watermark_id      text  UNIQUE  -- opaque, e.g. "wm_8f3a92..."
status            text          -- active | revoked | transferred
minted_at         timestamptz
last_access_at    timestamptz
revoked_at        timestamptz NULL
```

### `renders`

```
render_id         uuid  PK
grant_id          uuid  FK
release_id        text  FK
wallet            text
watermark_id      text          -- denormalized for fast scan lookup
render_uri        text          -- bucket://renders/<id>.flac
render_hash       text
embed_layers      jsonb         -- { "A": true, "B": true, "C": true }
ktrs_cost         numeric
created_at        timestamptz
```

### `watermark_payloads`  (highly restricted)

```
watermark_id      text  PK
payload_bits      bytea         -- the actual 64+32+16 bit stream
release_id        text
wallet            text
encrypted         bool          -- payload at rest is HSM-wrapped
created_at        timestamptz
```

Access to this table is HSM-gated and audit-logged. The web app never reads it directly; only the scan worker does, via a service account.

### `scans`

```
scan_id           uuid  PK
release_id        text  FK
uploaded_by       text          -- creator wallet
input_uri         text
input_hash        text
status            text          -- queued | running | matched | nomatch | failed
matched_wm_id    text NULL
confidence        int           -- 0..100
extraction_log    jsonb
ktrs_cost         numeric
created_at        timestamptz
completed_at      timestamptz NULL
```

### `evidence_reports`

```
evidence_id       text  PK
scan_id           uuid  FK
release_id        text
matched_wallet    text
matched_grant_id  uuid
confidence        int
nft_history       jsonb         -- snapshot of transfers at report time
report_uri        text          -- signed PDF in bucket
report_hash       text
on_chain_anchor   text          -- Solana tx sig
created_at        timestamptz
```

### `token_events`

```
event_id          uuid  PK
kind              text          -- "ktrs_debit" | "lvtn_fee" | "lvtn_stake_reward"
actor_wallet      text
amount            numeric
token             text          -- "KTRS" | "LVTN"
related_kind      text          -- "render" | "scan" | "register" | ...
related_id        text
created_at        timestamptz
```

---

## Trust boundaries

- **Public:** all on-chain accounts, release metadata, NFT mints, evidence anchors (hashes only).
- **Creator-private:** access list (wallet labels), scan history, evidence reports, render URIs.
- **Operator-only / HSM-gated:** `watermark_payloads`, render bytes for non-owners, scan extraction internals.

The boundary between creator-private and operator-only is enforced by service-to-service auth; the boundary between operator-only and HSM is enforced by hardware key wrapping.
