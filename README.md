# NFTones MVP

NFT-based audio provenance and leak attribution — a self-contained module designed to drop into the existing **Leviathan ($LVTN)** crypto/social platform without rebuilding anything.

> Creators register audio releases on Solana, mint wallet-bound access NFTs, and serve every authorized listener a uniquely watermarked render. When a leak surfaces, NFTones extracts the embedded payload and identifies which wallet's copy escaped.

---

## What's in this folder

```
nftones/
├── README.md                     ← you are here
├── docs/
│   ├── 01-whitepaper.md          NFTones section of the Leviathan whitepaper
│   ├── 02-prd.md                 Product requirements (P0/P1/P2)
│   ├── 03-data-model.md          On-chain (Solana) + off-chain (Postgres/object store)
│   ├── 04-api-events.md          REST + WebSocket + worker queue contracts
│   └── 05-integration.md         How to plug into Leviathan-blockchain
├── mock-data/
│   └── data.js                   Releases, wallets, grants, scans, evidence, token events
└── web/
    ├── index.html                Single-page prototype
    ├── styles.css                Forensic-console design tokens + components
    └── app.js                    Routing, rendering, scan simulation, modal flow
```

## How to run

This is a static prototype — no build step, no server required.

```bash
# from the nftones/ directory
python3 -m http.server 8000
# then visit http://localhost:8000/web/
```

Or just open `web/index.html` in a browser. (Modern browsers will fetch `../mock-data/data.js` correctly via `file://` for most setups; if not, use the local server.)

## How to test

The prototype exercises every screen with mock data:

1. **Dashboard** — KPIs animate up; recent activity timeline + exposure bars.
2. **Release registry** — three pre-anchored releases with generated cover art, master-hash, anchor-tx.
3. **New release** — top-right "New release" button → modal that estimates $KTRS cost as you paste wallets, then adds a release + grants.
4. **Wallet access** — table with release/tier/status filters, risk-scored rows, working "Revoke" action.
5. **Watermark map** — payload-bit breakdown, three embed layers, full mapping table (creator-private).
6. **Leak check** — three demo scans:
   - `leaked telegram clip` → high-confidence match (92%) on *Halcyon Drift* → `H8rL...Mb6K` (press reviewer).
   - `low-bitrate rip` → medium-confidence match (78%) on *Brassknuckle Lullaby* → already-revoked label admin wallet.
   - `unrelated file` → no NFTones watermark detected; explains it's a non-NFTones source.
   Click "Generate evidence report" to promote the result and jump to Evidence.
7. **Evidence** — signed reports with NFT transfer history, on-chain anchor, caveats.
8. **Token flow** — $KTRS vs $LVTN cards, recent token events, flow diagram.

Resize to 720px / 480px to verify mobile layout — the sidebar collapses into a drawer.

## Design decisions

- **Forensic-console aesthetic** — deep slate base (`#06080c` → `#11141b`), single mint-teal accent (`#42e2c5`) reserved for action and confirmation, amber for medium-confidence and warning, magenta for danger/revoked. JetBrains Mono for hashes, IDs, and numerics; Satoshi for everything else. The design says "this is an evidence tool, not a marketing page."
- **Polished but restrained motion** — animated count-ups, scanner stage progress, hero waveform pulse, and entrance fade — no decorative scroll-tied effects. `prefers-reduced-motion` honored.
- **Scan as the centerpiece flow** — the leak-check view is the most editorialized screen because attribution *is the product*. Three demos cover the high-confidence, partial-confidence, and no-match cases that creators will actually experience.
- **Wallet labels, not raw addresses** — creators give labels like "Press reviewer — Static Zine" so the evidence view reads as a narrative, not a hex dump. Labels are creator-private.
- **No on-chain wallet→watermark map** — the prototype enforces the architectural rule visually: the "watermark map" view says "creator-private · HSM-wrapped at rest." On-chain pages only ever show hashes and NFT mints.
- **Token panel makes the split obvious** — separate $KTRS (utility, gold) and $LVTN (governance, lavender) cards, with use-case lists side-by-side. The flow diagram closes the loop: creator spends $KTRS → protocol → treasury accrues $LVTN fees → stakers govern + earn.
- **Self-contained** — no external API calls, no real audio, no real wallets. All addresses, titles, file names, and labels are fictional. Watermark IDs and master hashes are illustrative.

## What's intentionally not built

- Real audio file processing. The dropzone accepts a drop but the prototype never reads the bytes — it kicks off a deterministic demo scan instead. (No copyrighted audio is processed, embedded, or referenced.)
- Wallet auth. The "connected" state is hard-coded. Production binds via the host app's existing Phantom/Backpack adapter — see `docs/05-integration.md`.
- Backend. Mock data lives in `mock-data/data.js`. Phase 1 ports views to React + a real `nftones-api` service (FastAPI/Express); Phase 2 adds the embed/scan workers; Phase 3 deploys the Anchor program to devnet. See `docs/02-prd.md` and `docs/05-integration.md`.

## Safety / compliance posture for the demo

- No copyrighted audio anywhere in the repo.
- No real wallet addresses (truncated and synthetic — `9xQe...A4mP` style placeholders).
- No real PII. Wallet labels are fictional ("Press reviewer — Static Zine").
- No external network calls. No analytics. No tracking.
- No secrets, API keys, or environment-variable expectations.
