# NFTones Integration Architecture

## Recommended Stack

The safest production design is Solana plus controlled object storage.

- **Solana**: Mint records, access passes, metadata hashes, receipt hashes, payment settlement, and public verification.
- **Controlled object storage**: Encrypted master audio, wallet-specific watermarked copies, private watermark maps, leak evidence, and takedown records.
- **Application database**: Creator profiles, release metadata, access policies, scan results, compute usage, and audit logs.
- **$KTRS metering service**: Calculates media and AI compute costs.
- **$LVTN value router**: Routes protocol share into treasury, staking, liquidity, grants, or governance-approved programs.

## Module Boundaries

```text
nftones/
  app/
    Creator dashboard
    Release registry
    Wallet access manager
    Leak scanner
    Evidence report viewer
    Token flow panel

  services/
    audio hashing
    watermark assignment
    watermark embedding
    watermark detection
    receipt hashing
    chain anchoring
    KTRS metering
    LVTN value routing

  storage/
    encrypted masters
    watermarked derivatives
    private evidence files
    metadata JSON

  contracts/
    release registry
    access NFT/pass
    receipt anchor
```

## Production Event Model

| Event | Trigger | Output |
|---|---|---|
| release.created | Creator registers audio | Release ID, master hash, metadata hash |
| access.granted | Creator grants wallet access | Access grant, license type |
| watermark.assigned | Wallet requests copy | Watermark ID, private mapping, receipt hash |
| audio.rendered | Watermarked copy generated | Storage URI, derivative hash |
| leak.scan.started | Creator submits suspected leak | Scan ID |
| leak.scan.completed | Scanner finds result | Match status, confidence, report hash |
| compute.metered | Media/AI action completes | $KTRS cost and usage details |
| lvtn.flow.recorded | Protocol share calculated | Treasury/liquidity/staking/grant allocation |

## KTRS Metering Formula

The MVP can start with a simple formula:

```text
KTRS charge = base action fee + usage units + verification fee
```

Production can expand this to:

```text
KTRS charge =
  provider cost reserve
  + infrastructure reserve
  + watermarking/scanning compute
  + protocol margin
  + verification/anchoring fee
```

Then:

```text
Protocol margin → $LVTN ecosystem flow
```

## Privacy Rules

- Store only hashes on-chain for sensitive evidence.
- Do not put full audio, listener identity, IP addresses, or private investigation records on-chain.
- Use wallet addresses carefully in public reports.
- Allow compromised-wallet dispute handling.
- Use neutral forensic language.

## MVP Implementation Notes

The prototype should simulate:

- Wallet connection
- Release registration
- Master file hash
- Watermark ID assignment
- Leak scan matching
- Evidence report generation
- $KTRS cost estimate
- $LVTN ecosystem flow estimate

The production system should later replace mock watermark detection with a real audio watermarking library or commercial forensic watermarking provider.
