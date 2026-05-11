# NFTones — Integration Notes (Leviathan-blockchain)

This module is **purpose-built to plug into the existing Leviathan ($LVTN) app, not to replace it.** The MVP lives at `Leviathan-blockchain/nftones/` and exposes a self-contained UI + a typed surface so the host app can mount it as a route, panel, or modal.

## Repo layout (recommended placement)

```
Leviathan-blockchain/
├── apps/
│   ├── web/                     # existing $LVTN web app — UNTOUCHED
│   └── ...
├── packages/
│   ├── ui/                      # existing shared UI
│   └── ...
├── nftones/                     # ← this MVP
│   ├── docs/
│   │   ├── 01-whitepaper.md
│   │   ├── 02-prd.md
│   │   ├── 03-data-model.md
│   │   ├── 04-api-events.md
│   │   └── 05-integration.md
│   ├── mock-data/
│   ├── web/                     # static prototype (this MVP's deliverable UI)
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   └── README.md
└── ...
```

When NFTones graduates from prototype to integrated module:

```
Leviathan-blockchain/
├── apps/
│   └── web/
│       └── src/routes/nftones/  # mounts the React port
├── services/
│   ├── nftones-api/             # FastAPI/Express service
│   └── nftones-workers/         # embed + scan workers
├── programs/
│   └── nftones/                 # Anchor (Solana) program
└── packages/
    └── nftones-sdk/             # typed client (TS) shared by web + workers
```

## Mount surface in the existing $LVTN app

The host app integrates NFTones in three places:

1. **Creator Studio sidebar** — new entry "NFTones" links to `/studio/nftones` and renders this prototype's `<NFTonesApp />` (after React port).
2. **Wallet panel** — when a wallet holds an `AccessNFT`, the wallet drawer adds a "Listen" action that hits `/api/v1/access/:grant_id/render` and streams the wallet-specific render.
3. **Search/profile** — when an artist profile is opened, surfacing public release anchors (read-only) is a one-call to `/api/v1/releases?creator=:wallet`.

## Dependency direction

NFTones depends on the host for:

- Wallet auth (Phantom / Backpack adapter already in `packages/wallet`)
- $KTRS/$LVTN balances (already in `packages/token`)
- Notification toasts
- Theme tokens

NFTones does **not** depend on:

- The trading engine
- The social graph
- Any other vertical module

This keeps it shippable behind a feature flag.

## Token-flow contract

NFTones never mints or burns $LVTN/$KTRS itself. It calls the existing `packages/token` actions:

```ts
token.debit({ wallet, amount, token: "KTRS", reason: "nftones.embed" })
token.fee({ wallet, amount, token: "LVTN", reason: "nftones.platform_fee" })
```

The host's treasury contract is the source of truth; NFTones is a metered consumer.

## Feature flags

| Flag                          | Default | Effect                                  |
| ----------------------------- | ------- | --------------------------------------- |
| `nftones.enabled`             | off     | Hides sidebar entry                     |
| `nftones.scan_enabled`        | off     | Hides leak-check view                   |
| `nftones.evidence_enabled`    | off     | Disables on-chain evidence anchoring    |
| `nftones.bulk_csv`            | off     | Hides bulk wallet upload (P1)           |

## Migration path from prototype to production

1. **Phase 0 (this MVP).** Static HTML/CSS/JS prototype against mock JSON. Demoable.
2. **Phase 1.** Port views to React + the Leviathan UI kit. Wire to mock API in `services/nftones-api` (in-memory).
3. **Phase 2.** Real embed/scan workers (Python, FFmpeg + custom DSP). Postgres + S3-class object store.
4. **Phase 3.** Solana Anchor program deployed to devnet. Integration tests against host wallet adapter.
5. **Phase 4.** Mainnet, behind staged rollout (10% creators → 50% → all).

## Security posture for production

- **HSM** (CloudHSM or equivalent) wraps watermark-payload encryption keys.
- **Object store** is private, default-deny. Signed URLs only, ≤ 5 min TTL.
- **Audit log** is append-only (S3 Object Lock or Postgres logical-replication to a write-once store).
- **Service-to-service mTLS** between API ↔ workers ↔ HSM proxy.
- **No PII** in NFTones data model. Wallet labels are creator-supplied free text and treated as creator-confidential.

## Why Solana (vs alternatives)

| Criterion                | Solana | Ethereum L1 | Base/L2 |
| ------------------------ | ------ | ----------- | ------- |
| Mint cost (access NFT)   | <$0.01 | $5–50       | $0.05–0.50 |
| Throughput               | High   | Low         | Medium  |
| Wallet UX in $LVTN stack | Native | Bridged     | Bridged |
| Metaplex tooling         | Yes    | n/a         | n/a     |
| Compressed NFTs (cNFTs)  | Yes (huge cost win for label-scale access lists) | No | Limited |

cNFTs are decisive for label workflows where a single release may issue 5–50k access NFTs.

## Why controlled object storage (vs IPFS/Arweave for masters)

Masters and renders **must not** be public. Public/permanent storage networks are unsuitable for the bytes themselves. Public storage is fine for:

- Release artwork (the public-facing asset)
- Perceptual fingerprint blob (already a one-way derivation)
- Evidence-report **hash** anchored on-chain

Master audio, watermarked renders, and the watermark-payload table live in private object storage with KMS/HSM-wrapped keys.
