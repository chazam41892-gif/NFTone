# NFTones — Whitepaper (Section)

*A module of the Leviathan ($LVTN) ecosystem*

> Audio provenance, wallet-bound watermarking, and leak attribution as a native primitive of the $LVTN crypto-social platform.

---

## 1. Abstract

NFTones is an NFT-based audio provenance and leak-tracking system designed for the Leviathan platform. Creators register audio releases on-chain, mint access NFTs that bind playback rights to specific wallets, and serve every authorized listener a **wallet-specific watermarked copy** of the master. When a release surfaces in a leak — pirate site, leaked DM, ripped stream — NFTones extracts the embedded wallet ID from the leaked file and produces a cryptographic evidence report identifying which wallet's copy was leaked.

The system pairs **Solana** (low-cost on-chain anchoring of release hashes, access NFTs, and revocations) with **controlled object storage** (private S3-class buckets holding masters, watermark mappings, and AI compute artifacts). The on-chain layer is the source of truth for *ownership and access*; the off-chain layer is the source of truth for *audio bytes and watermark secrets*. The two are bound by content hashes and signed access receipts.

Token roles:

- **$KTRS** — utility / compute token. Pays for media operations: watermarking jobs, leak-scan compute, AI fingerprint training, evidence-report generation, archival storage.
- **$LVTN** — governance / ecosystem token. Captures platform value via fee accrual, governs policy (e.g. royalty splits, takedown thresholds), and stakes for creator verification tiers.

## 2. Problem

Independent musicians and labels operating in crypto-social environments face a structural leak problem:

1. **Pre-release leaks** from collaborators, mixing engineers, A&R, and label staff — each of whom received an "approved" copy.
2. **Post-release piracy** on Telegram channels, Discord servers, file lockers, and ripped streams.
3. **No attribution path.** Today's options are either weak forensic watermarking buried in label workflows, or none at all. Once a file leaks, the creator cannot tell *whose* copy escaped.

DRM is brittle (cracked, unpopular with listeners, doesn't help post-leak). Hashing the master only proves "this is my song" — not "this came from Alice's wallet." NFTones is built around the second question.

## 3. Design Principles

1. **On-chain ownership, off-chain bytes.** Never put audio on-chain. Anchor hashes only.
2. **Every authorized copy is unique.** Each access NFT holder receives a perceptually-identical but bit-distinct watermarked render.
3. **Watermarks must survive transcoding.** Use psychoacoustic spread-spectrum + echo-hiding redundancy, not metadata tags.
4. **Private mappings.** The wallet → watermark-ID map lives in controlled storage with audit logs, not on-chain.
5. **Evidence, not enforcement.** NFTones produces signed evidence reports. Takedowns and legal action are downstream.
6. **Creator-first economics.** Creators pay $KTRS only for compute they consume. $LVTN holders govern fee curves.

## 4. System Overview

```
                   ┌────────────────────────────────────────────┐
                   │            Leviathan ($LVTN) App           │
                   │   (existing social/trading shell, not      │
                   │    rebuilt — NFTones plugs in as module)   │
                   └───────────────┬────────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
     ┌─────────────┐      ┌────────────────┐     ┌──────────────────┐
     │  NFTones UI │      │  NFTones API   │     │  NFTones Workers │
     │  (this MVP) │◀────▶│  (REST + WS)   │◀───▶│ watermark / scan │
     └─────────────┘      └───────┬────────┘     └──────────┬───────┘
                                  │                         │
                ┌─────────────────┼─────────────────┐       │
                ▼                 ▼                 ▼       ▼
         ┌───────────┐    ┌──────────────┐   ┌────────────────────┐
         │  Solana   │    │ Object Store │   │  Watermark / Scan  │
         │  (anchors,│    │ (masters,    │   │  AI compute        │
         │   NFTs)   │    │  renders,    │   │  (priced in $KTRS) │
         │           │    │  WM map)     │   │                    │
         └───────────┘    └──────────────┘   └────────────────────┘
```

## 5. Lifecycle

1. **Register.** Creator uploads master. System computes `master_hash` (BLAKE3) + perceptual fingerprint. A `Release` record is anchored on Solana with metadata URI; master stored in controlled bucket.
2. **Mint access.** Creator (or label admin) mints `AccessNFT`s to specific wallets — collaborators, reviewers, early listeners, ticket holders. Each NFT carries a `watermark_id` reference (opaque to chain).
3. **Render.** When wallet `W` first authenticates, a worker pulls the master, embeds a wallet-specific watermark payload, writes the rendered file to storage, and logs the mapping `(release_id, wallet, watermark_id, render_hash)` in the controlled DB. Compute is debited in $KTRS.
4. **Distribute.** Wallet downloads/streams its specific render via signed URL.
5. **Leak.** Suspect file is uploaded to NFTones leak-check tool.
6. **Scan.** AI extractor recovers the watermark payload (or partial payload). System cross-references the mapping table.
7. **Report.** A signed evidence report names the wallet, render hash, mint event, NFT transfer history, confidence score, and chain anchors.

## 6. Watermarking

Production builds use a layered scheme. None of the audio in this MVP is real or copyrighted; watermark IDs in the demo are illustrative:

- **Layer A — Spread-spectrum** in 2–6 kHz band, 28 dB below masking threshold. Carries a 64-bit payload.
- **Layer B — Echo-hiding** with 1ms / 2ms delays as 0/1 bits across decorrelated time blocks. Carries a redundant 32-bit payload.
- **Layer C — Phase coding** in low-energy regions for a 16-bit checksum.

Payload structure: `[release_id : 24b][wallet_index : 32b][version : 4b][crc : 4b]`. The `wallet_index` is an opaque pointer into the controlled mapping table; the wallet address itself is never embedded. This prevents an attacker who breaks watermark extraction from learning anything beyond an opaque ID.

Survives: 128 kbps MP3, AAC re-encode, single-pass EQ, mild compression, phone-recording-of-speakers (degraded confidence). Does not survive: aggressive pitch-shift + heavy distortion + re-mastering. Reported confidence reflects this.

## 7. Token Flow

| Action                                | $KTRS (utility)      | $LVTN (governance/value)        |
| ------------------------------------- | -------------------- | ------------------------------- |
| Register release (anchor + fingerprint) | Pays scan/embed cost | Small platform fee → treasury   |
| Mint access NFT                       | Pays render compute  | Platform fee → treasury         |
| Listener stream                       | Micro-fee per stream | Fee split to $LVTN stakers      |
| Leak scan                             | Pays AI compute      | —                               |
| Evidence report                       | Pays signing/anchor  | Premium reports require staked $LVTN tier |
| Governance vote (fee curves, takedown policy) | —          | One vote per staked $LVTN       |
| Creator verification badge            | —                    | Stake $LVTN to unlock tier      |

$KTRS sinks are operational; $LVTN sinks are positional. Treasury fees are split per a governance-controlled curve (initial proposal: 60% creator-rewards pool, 25% $LVTN stakers, 15% protocol dev).

## 8. Threat Model (summary)

- **Insider leak (collaborator).** Primary use case. Detected with high confidence.
- **Re-encoding to evade.** Mitigated by Layers A+B redundancy.
- **Speaker-rip / acoustic re-record.** Detected at lower confidence; flagged as such in evidence.
- **Watermark stripping tool.** Possible against Layer A alone; B and C raise the cost.
- **Mapping-table compromise.** Catastrophic — protected by HSM-wrapped keys, append-only audit log, and split-knowledge admin.
- **Wallet handover (NFT resold).** Tracked: NFT transfer history is part of the evidence report. The leak is attributed to the *holder at time of render*, not the current owner.

## 9. Out of Scope (v1)

- Royalty distribution engine (separate Leviathan module).
- DRM-style playback locking.
- Video.
- Mobile native clients.
- Real-money fiat on-ramp.

---

*This document is the NFTones section of the Leviathan whitepaper. It is normative for the v1 module spec and informative thereafter.*
