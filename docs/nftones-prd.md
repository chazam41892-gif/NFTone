# NFTones Product Requirements

## Problem Statement

Creators need a safer way to distribute audio inside the $LVTN trading and social platform without losing control over unreleased songs, voice recordings, samples, demos, or premium audio drops. Existing NFT systems can show ownership, but they usually do not identify which wallet-specific copy produced a leak. This creates a gap between provenance and enforcement.

NFTones solves this by combining release registration, wallet-based access, forensic watermarking, and leak evidence reporting.

## Goals

- Enable creators to register official audio releases with verifiable provenance.
- Tie audio access to wallet identities and NFTone ownership or permissions.
- Generate wallet-specific watermark records for each stream or download entitlement.
- Let creators scan suspected leaked audio and identify the wallet-specific copy that matches.
- Meter media and AI compute actions through the $KTRS model while reinforcing $LVTN ecosystem value.

## Non-Goals

- NFTones will not adjudicate legal guilt automatically.
- NFTones will not expose private listener data publicly on-chain.
- NFTones will not store protected master audio on public immutable storage by default.
- NFTones will not replace a full DMCA or legal enforcement workflow in the MVP.
- NFTones will not implement production-grade audio watermarking in the mock prototype; the MVP will simulate watermark IDs until a dedicated audio watermarking library or service is selected.

## User Stories

- As a creator, I want to register a master audio release so that I can prove the release existed at a specific time.
- As a creator, I want every wallet to receive a unique watermarked access copy so that leaked files can be traced.
- As a creator, I want to scan a suspected leaked audio file so that I can see whether it matches one of my issued wallet copies.
- As a listener, I want to understand the license attached to my NFTone so that I know what I can and cannot do with the audio.
- As a platform operator, I want private evidence data to stay off-chain so that the platform avoids unnecessary privacy and defamation risk.
- As a protocol designer, I want $KTRS to meter compute-heavy media actions so that platform usage has an economic settlement layer.

## Requirements

### P0: Release Registry

Acceptance criteria:

- Given a creator is connected with a wallet, when they register a release, then the system creates a release record with title, creator wallet, master file hash, status, and timestamp.
- Given a release exists, when the creator views it, then the system shows provenance status, access count, watermark count, and leak status.
- Given a release is marked private, when an unauthorized wallet attempts access, then the system denies access.

### P0: Wallet Access List

Acceptance criteria:

- Given a creator adds a wallet to a release, when the wallet is saved, then the system records the license type and access level.
- Given a wallet has access, when a stream/download is requested, then the system creates or retrieves a wallet-specific watermark assignment.
- Given access is revoked, when the wallet requests a new copy, then the system blocks new access while preserving historical receipts.

### P0: Watermark Assignment

Acceptance criteria:

- Given a wallet requests access, when the system grants access, then a unique watermark ID is assigned to that wallet/release pair.
- Given a watermark is assigned, when the creator opens the release dashboard, then the watermark table shows wallet, access type, issue time, status, and receipt hash.
- Given the same wallet requests access again, when the release policy allows reuse, then the same active watermark ID can be reused.

### P0: Leak Check Workflow

Acceptance criteria:

- Given a creator uploads or references a suspected leaked file, when the scanner runs, then the system returns match status, matched wallet if found, confidence, release ID, and evidence report hash.
- Given no watermark is detected, when the report is generated, then the system states that no known NFTones watermark was found.
- Given a match is detected, when the evidence report is displayed, then the language states that the leaked copy matches the wallet-specific watermark, not that the wallet owner is automatically guilty.

### P1: Token Flow Panel

Acceptance criteria:

- Given a compute action occurs, when the user views the cost panel, then the system shows estimated $KTRS cost, provider/infrastructure reserve, protocol share, and $LVTN ecosystem flow.
- Given a creator runs a scan, when the action completes, then the system records a mock $KTRS compute event.

### P1: Evidence Report

Acceptance criteria:

- Given a leak scan completes, when the creator opens the report, then the system shows matched wallet, watermark ID, release, confidence, timestamp, and recommended next steps.
- Given a report is finalized, when the evidence hash is created, then it can be anchored on-chain in production.

### P2: Royalty Splits

Acceptance criteria:

- Given a release has collaborators, when revenue is recorded, then the system can display planned split percentages.
- Given collaborators are added, when the release page loads, then the creator can see payout addresses and roles.

## Success Metrics

- Release registration completion rate
- Number of wallet-specific watermark assignments created
- Percentage of protected releases with at least one access wallet
- Leak scan completion rate
- Evidence reports generated
- Creator retention after first protected release
- $KTRS compute actions per release

## Data Model

| Entity | Key fields |
|---|---|
| Release | id, title, artist, creator_wallet, master_hash, metadata_hash, status, created_at |
| AccessGrant | id, release_id, wallet, license_type, access_level, status, granted_at |
| WatermarkAssignment | id, release_id, wallet, watermark_id, receipt_hash, status, issued_at |
| LeakScan | id, release_id, suspected_file_hash, matched_watermark_id, matched_wallet, confidence, report_hash, created_at |
| ComputeEvent | id, action_type, provider, usage_units, ktrs_cost, protocol_share, lvtn_flow, created_at |

## Open Questions

- Which production watermarking engine should be used?
- Should access NFTones be transferable, soulbound, or policy-configurable?
- Should $KTRS be prepaid, debited in real time, or abstracted as internal credits with periodic settlement?
- Should evidence report anchoring happen immediately or only after creator review?
- Which audio formats are supported at launch?
