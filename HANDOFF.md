# NFTones MVP — Handoff

## What was built

A self-contained NFTones prototype package at `Leviathan-blockchain/nftones/`. It is **not** a rewrite of the existing $LVTN app — it is a deployable module that can later be mounted inside it.

## Key file paths

| File                                   | What's in it                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `nftones/README.md`                    | Overview, run instructions, design decisions, scope                          |
| `nftones/HANDOFF.md`                   | This file                                                                    |
| `nftones/docs/01-whitepaper.md`        | NFTones whitepaper section ($LVTN ecosystem, $KTRS/$LVTN token roles, watermarking, threat model) |
| `nftones/docs/02-prd.md`               | PRD with P0/P1/P2 requirements, user stories, success metrics                |
| `nftones/docs/03-data-model.md`        | On-chain (Solana) + off-chain (Postgres + object store) schemas, trust boundaries |
| `nftones/docs/04-api-events.md`        | REST + WebSocket + worker queue contracts                                    |
| `nftones/docs/05-integration.md`       | How to plug into `Leviathan-blockchain` repo, mount points, feature flags, migration phases |
| `nftones/web/index.html`               | Single-page prototype (7 views + modal + toast)                              |
| `nftones/web/styles.css`               | Forensic-console design system (dark slate + mint-teal accent)               |
| `nftones/web/app.js`                   | Routing, view rendering, scan simulation, new-release flow                   |
| `nftones/mock-data/data.js`            | Synthetic releases, wallets, grants, scans, evidence, token events           |
| `nftones/qa-*.png`                     | Visual QA screenshots (desktop + mobile)                                     |

## How to run / test

**Local:**
```bash
cd Leviathan-blockchain/nftones
python3 -m http.server 8000
# open http://localhost:8000/web/
```

**Deployed:** the prototype is published as a Computer site (the `deploy_website` URL is shown inline above this handoff in the UI).

**Test flow** (3 minutes):
1. Land on Dashboard — KPIs animate, recent activity timeline + exposure bars visible.
2. Click "Leak check" → click "leaked telegram clip" demo → watch the 6-stage scanner progress → high-confidence (92%) match identifies wallet `H8rL...Mb6K` (Press reviewer — Static Zine).
3. Click "Generate evidence report" → toast confirms, jumps to Evidence view with NFT transfer history + on-chain anchor.
4. Try the other two demo scans: "low-bitrate rip" (78% match on a *revoked* label admin wallet) and "unrelated file" (no NFTones watermark detected, with explanation).
5. "New release" button (top right) opens a modal with live $KTRS cost estimate as you paste wallet addresses.
6. Resize to mobile — sidebar collapses into a drawer behind a hamburger.

## Design decisions

- **Solana + controlled object storage.** On-chain stores hashes, NFT mints, and evidence anchors only. Master audio, watermark renders, and the wallet→watermark mapping live in private object storage with HSM-wrapped keys. This is documented in the whitepaper (§6, §8) and integration notes, and *visually enforced* in the UI: the "Watermark map" view is labeled "creator-private · HSM-wrapped at rest."
- **Forensic-console aesthetic.** Deep slate base with a single mint-teal accent. JetBrains Mono for hashes/IDs, Satoshi for everything else. The design says "evidence tool," not "marketing page." Amber for medium confidence, magenta for revoked/danger.
- **Three-demo scan flow.** The leak-check view is the centerpiece because attribution *is the product*. The three demos cover the realistic outcomes: high-confidence match, partial match against a revoked grant, and no NFTones watermark (with fingerprint-only match note).
- **Token split is explicit.** The Token Flow view has separate $KTRS (utility, gold) and $LVTN (governance, lavender) cards with use-case lists. The flow diagram shows: creator spends $KTRS → protocol → treasury accrues $LVTN fees → stakers govern + earn. Token-pricing decisions appear in the modal as live-estimated costs.
- **No copyrighted audio, no real PII.** All wallet addresses are truncated synthetic strings. Release titles are fictional. The dropzone never reads dropped bytes — it kicks off deterministic demo scans.
- **Self-contained.** No build step, no external API calls, no environment variables, no secrets.

## Notes for the next agent

- A parallel agent appears to have written sibling docs in `nftones/docs/` (`nftones-whitepaper-section.md`, `nftones-prd.md`, `nftones-integration-architecture.md`). Those were not created or touched by this build — left in place per workspace rules. The canonical docs from this build are the numbered set (`01-whitepaper.md` through `05-integration.md`).
- The `qa-*.png` screenshots in the project root were used for visual QA; they ship inside the deployed bundle but are harmless.
- For Phase-1 productization, see `docs/05-integration.md` — recommended target structure is `services/nftones-api`, `services/nftones-workers`, `programs/nftones` (Anchor), and `packages/nftones-sdk`.
