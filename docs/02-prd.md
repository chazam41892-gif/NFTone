# NFTones — Product Requirements (v1)

## 1. Problem Statement

Independent artists and small labels operating inside the Leviathan ($LVTN) social/trading platform have no structural way to identify *which* trusted recipient leaks a pre-release or release-only audio file. Today they hand out the same master to mixing engineers, collaborators, label staff, and early-access NFT holders. When the file appears on Telegram or a file locker, the trail is cold.

Evidence base:

- ~70% of pre-release leaks for indie acts come from a small set of trusted insiders (industry consensus; specific number used internally).
- Leviathan creator survey (n=140, internal): 64% report at least one leak in the past 12 months; 0% successfully attributed it.
- Existing forensic watermark vendors are label-priced and require workflow changes most indie creators will not adopt.

Cost of not solving: creator churn off Leviathan to platforms that *feel* safer, lower willingness to drop exclusives via Leviathan, and lost token velocity (less $KTRS spent on premium media features).

## 2. Goals

1. **Attribution rate ≥ 80%** on leaks where the leaked file is ≤ 2 transcodes from the rendered master.
2. **Creator self-serve registration in ≤ 90 seconds** from "I have a WAV" to "release is anchored and access list active."
3. **Round-trip leak-check in ≤ 5 minutes** for files under 25 MB.
4. **$KTRS sink ≥ 250k tokens / month** within 6 months of GA via watermarking and scan compute.
5. **Zero on-chain leakage of private wallet→watermark mappings.**

## 3. Non-Goals

1. **Royalty splits / payout engine.** Separate Leviathan module.
2. **Video provenance.** Audio only in v1.
3. **DRM playback enforcement.** NFTones is forensic, not preventive.
4. **Public leaderboard of leakers.** Evidence is creator-private; surfacing is a downstream legal decision.
5. **Mobile native apps.** Responsive web only in v1.

## 4. User Stories

### Creator (primary)

- As an indie artist, I want to register a finished master so that it is anchored and protected before I share it with collaborators.
- As an artist, I want to mint access NFTs to specific wallets so that each listener gets a uniquely watermarked copy without me managing files manually.
- As an artist, I want to upload a suspected leak and learn which wallet's copy it came from so that I can take action.
- As an artist, I want a signed evidence report so that I can hand it to a label, lawyer, or platform takedown desk.

### Label admin (secondary)

- As a label admin managing 30 artists, I want a dashboard view across all releases and active access lists so that I can audit exposure before a launch.
- As a label admin, I want to revoke access for a specific wallet so that future renders are blocked.

### Collaborator / listener (tertiary)

- As a collaborator, I want to know my wallet has been granted access without exposing my address publicly so that I can play the file privately.
- As a listener, I want my access NFT to be transferable to another wallet I own without losing access so that I can move between devices.

### Governance ($LVTN holder)

- As an $LVTN staker, I want to vote on platform fee curves so that creator economics stay healthy.

## 5. Requirements

### P0 — Must Have

| ID    | Requirement                                       | Acceptance                                                                      |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| R-01  | Register a release with title, artwork, master file | Given a creator with a WAV/FLAC, when they submit the release form, then a `Release` is created with `master_hash`, fingerprint, and Solana anchor tx. |
| R-02  | Mint access NFTs to a list of wallets             | Given a registered release, when the creator pastes wallet addresses, then each receives an `AccessNFT` and a unique `watermark_id` is generated. |
| R-03  | Render wallet-specific watermarked copy on first access | Given an access NFT holder, when they request playback, then a worker produces a render with embedded payload and stores it. |
| R-04  | Leak-check upload                                 | Given a creator with a suspect file, when they upload, then the system extracts the watermark payload (or returns "no payload found") in ≤ 5 min. |
| R-05  | Evidence report                                   | Given a successful extraction, when the creator clicks "generate report," then a signed PDF/JSON is produced with wallet, render hash, NFT history, and confidence. |
| R-06  | Wallet access list view                           | Creator can see all wallets with access to a release, watermark IDs (opaque), mint date, last access, and revocation status. |
| R-07  | Token flow visibility                             | UI shows $KTRS debited for each compute action and $LVTN fees accrued. |
| R-08  | No copyrighted audio in demo                      | Demo uses generated/synthetic waveforms or named-but-empty placeholders. No third-party music. |

### P1 — Should Have

| ID    | Requirement                                |
| ----- | ------------------------------------------ |
| R-10  | Revoke access (future renders blocked)     |
| R-11  | NFT transfer history shown in report       |
| R-12  | Confidence score (high / medium / low) with reasoning |
| R-13  | Bulk wallet upload via CSV                 |
| R-14  | Email/in-app notification on leak detection |

### P2 — Could Have

| ID    | Requirement                                |
| ----- | ------------------------------------------ |
| R-20  | Auto-scan public sources (Telegram, file lockers) on a schedule |
| R-21  | Dispute / appeal flow for a flagged wallet |
| R-22  | Tier-gated features keyed to staked $LVTN  |

### Won't Have (v1)

- Royalty payout
- Video
- DRM
- Mobile native

## 6. Acceptance Criteria — Sample (R-04 leak-check)

- **Given** a creator with a 12 MB MP3 of a leaked file from a release they own,
  **When** they upload via the leak-check view,
  **Then** within 5 minutes the UI shows extracted `watermark_id`, matched wallet (opaque label + masked address), confidence score, and a "Generate Evidence Report" CTA.

- **Given** an upload of an unrelated file,
  **When** scan completes,
  **Then** UI shows "No NFTones watermark detected" with the option to file a fingerprint-only match.

- **Given** an upload of a heavily-distorted / pitch-shifted file,
  **When** Layer A fails but Layer B partially recovers,
  **Then** UI shows "low confidence" match with explicit caveats and recommendation not to act on this alone.

## 7. Success Metrics

| Metric                                | Type     | Target (6 mo) | Measurement                    |
| ------------------------------------- | -------- | ------------- | ------------------------------ |
| Releases registered                   | Adoption | 1,200         | Solana anchors                 |
| Active wallets with access NFTs       | Adoption | 8,000         | NFT holder count               |
| Leak-checks run                       | Activity | 600 / mo      | Worker job count               |
| Attribution success rate              | Quality  | ≥ 80%         | Verified extractions / total scans on real leaks |
| $KTRS sunk into NFTones compute       | Token    | 250k / mo     | On-chain burn / treasury inflow |
| Creator retention (registered → still active at 90d) | Lagging | ≥ 65% | Cohort analysis    |
| Time-to-first-render (P50)            | Latency  | ≤ 60 s        | Worker telemetry               |

## 8. Open Questions

| #   | Question                                                         | Owner      | Blocking? |
| --- | ---------------------------------------------------------------- | ---------- | --------- |
| Q-1 | Does Solana mint cost get subsidized for first-N creators?       | Token team | No        |
| Q-2 | Are evidence reports admissible? Get outside counsel review.     | Legal      | No (P1)   |
| Q-3 | Where does mapping-table custody live? In-house HSM vs. KMS-only? | Security  | Yes (P0 architecture) |
| Q-4 | Pricing of leak-scan in $KTRS — flat or per-MB?                  | Token team | No (default flat for v1) |
| Q-5 | Confidence-score thresholds for auto-takedown integration       | Product    | No (P2)   |
