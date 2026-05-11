# NFTones — Supported Media Types

**Updated:** 2026-05-11

NFTones is designed to handle **every media type a creator wants to sell with wallet-bound provenance** — not just audio. The platform-wide promise: *every file a buyer downloads is uniquely watermarked to them; if it leaks, NFTones identifies the wallet.*

## Roadmap by media type

| Type | Status | Service path | Watermark approach |
|---|---|---|---|
| **Audio** | ✅ **v0.1 shipped** (2026-05-11) | `services/audio_watermarker/` | FFT spread-spectrum, mid-band PN sequence per wallet |
| **Video** | 🟡 Designed, not implemented | `services/video_watermarker/` (planned) | DWT-domain watermark in the luminance channel + optional audio track watermark via the audio service |
| **Image** | 🟡 Designed, not implemented | `services/image_watermarker/` (planned) | DCT-domain watermark in chrominance channels — invisible, survives JPEG re-compression and moderate resize |
| **Document** (PDF, DOCX, EPUB) | 🟡 Designed, not implemented | `services/document_watermarker/` (planned) | Per-buyer steganography: invisible whitespace patterns + metadata fingerprint + (for PDF) per-page micro-shifts; for text-heavy docs, dynamic per-buyer synonym substitution as a fallback |

**Honest pacing:** each non-audio service is roughly 2–5 days of focused work. Video is the hardest (large files + real-time encoding); document is the easiest (mostly metadata + invisible whitespace tricks). None is shipped today.

## Common architecture across media types

All four services follow the same shape so they can be composed and replaced independently:

```
services/<type>_watermarker/
├── src/
│   ├── api.py            FastAPI surface (versioned: /api/v1/...)
│   ├── crypto.py         shared HMAC-SHA256 PN derivation (lives in a top-level shared module once 2+ services exist)
│   ├── watermarker.py    media-specific embed + detect
│   └── storage.py        SQLite for MVP; Postgres for prod
├── tests/                pytest, including survival-of-attacks tests
├── Dockerfile            isolated container
├── docker-compose.yml
└── README.md             honest about what works and what defeats it
```

The **public contract is identical across types**:

```http
POST /api/v1/watermark/embed       (multipart: file, release_id, wallet_id) → watermarked file
POST /api/v1/watermark/detect      (multipart: file, optional release_id)   → JSON match result
GET  /api/v1/health
GET  /api/v1/version
```

That means the $LVTN adapter only needs ONE shape of request, routed by content-type:
- `audio/wav`, `audio/mpeg` → audio service on `:8500`
- `video/mp4`, `video/quicktime` → video service on `:8501`
- `image/jpeg`, `image/png` → image service on `:8502`
- `application/pdf`, `application/vnd.openxmlformats-officedocument.*`, `application/epub+zip` → document service on `:8503`

## Honest limits — by type

Every type has a different list of attacks that defeat its watermark. The README of each service lists its own. Common pattern across all four:

- **Re-creation through analog hole** (re-recording audio, screen-recording video, photographing an image, retyping a document) ALWAYS strips the watermark. There is no exception. Don't pitch "uncopyable" — it's a lie. Pitch "attributable on first leak" — that's the truth and it's still valuable.
- **Heavy denoising / aggressive compression** can reduce confidence. Each service publishes the parameter range where survival is reliable.
- **Format conversion** through lossy codecs (MP3, AAC, JPEG, H.264 web) is the **intended** attack surface — watermarks must survive these. If a service can't survive ordinary re-encoding, it's not shipping.

## Why this isn't all in one service

Two reasons, both rooted in `fortune-500-upgrade-discipline`:

1. **Isolation.** A bug in the video service (which deals with multi-GB files and ffmpeg subprocesses) must not crash audio detection (which deals with small files and pure-numpy math). One process per media class.
2. **Lifecycle.** Each codec evolves on its own timeline. The audio service might need an update when AAC-LC defaults change at YouTube; the video service might need updates when H.265 watermark literature improves; the document service might break when Microsoft changes the OOXML internal structure. Independent deploys.

## When a creator uploads a media file to $LVTN

The flow the $LVTN adapter implements (separate document; this is just the contract):

```
1. Creator uploads master → $LVTN computes content-type → routes to right NFTones service
2. NFTones service:
   a. Stores encrypted master (only the platform can decrypt)
   b. Computes master_sha256
   c. Returns release_id
3. Creator publishes — emits `release.created` event
4. Buyer purchases via $LVTN
5. $LVTN adapter calls NFTones `/api/v1/watermark/embed` with (release_id, buyer_wallet)
6. NFTones returns watermarked file → adapter pipes bytes to buyer download
7. Adapter records the derivative hash to the buyer's purchase row in $LVTN DB
```

The flow is **identical** for audio, video, image, and document. That's the payoff of forcing the same contract across services.

## Permissions (per user's request 2026-05-11)

All four media types are **first-class supported scope** from day one in the platform contract. Adapters, UI affordances, payment hooks, and event subscriptions in the $LVTN platform should treat audio/video/image/document equally — even though only the audio backend ships in v0.1. The video/image/document endpoints will return `503 Service Unavailable {"reason": "not_yet_implemented", "eta": "<date>"}` until their services land. Honest 503 per CLAUDE.md Rule (no fake `{ok:true}` stubs).
