# NFTones — Audio Watermarker

Embeds wallet-derived spread-spectrum watermarks in audio. Detects which wallet a suspected leak belongs to.

This is the first real backend service in the NFTones module. Everything else (release registry, $KTRS metering, scan worker queue, etc.) wraps around or feeds into this.

## What this service IS

- A real, working audio watermarker — not vibes
- Spread-spectrum, FFT-domain, mid-frequency-band carrier
- Each wallet gets a deterministic ±1 pseudo-random sequence (PN) derived from `HMAC-SHA256(wallet_id, master_secret)` — no per-wallet blob stored
- Embed: input WAV → output WAV with the wallet's PN modulating mid-band magnitudes (α ≈ 0.05, inaudible)
- Detect: input WAV → correlate against every registered wallet's PN → highest match above threshold wins
- SQLite-backed watermark records: `(release_id, wallet_id, master_sha256, derivative_sha256, params, created_at)`

## What this service IS NOT (be honest)

- **Not unbreakable.** Aggressive low-pass under 1 kHz, time-stretching beyond ±4%, heavy denoising, and the analog hole (re-recording through speakers) can defeat the watermark. There is NO audio watermark that survives every attack. Set user expectations accordingly.
- **Not video.** Audio only. Video watermarking is a separate, harder problem and lives in its own service (NFTube, future).
- **Not authenticated.** This service trusts its caller. The $LVTN adapter (or any future caller) is responsible for auth at its edge. **Do not expose `:8500` to the open internet.**
- **Not horizontally scalable yet.** SQLite + in-process detection is fine up to thousands of wallets. Beyond that, swap to Postgres + a worker queue (v3).

## What this service NOW IS (v2 — audio PERFECTLY)

- **Multi-format I/O.** WAV, MP3, AAC/M4A, FLAC — uploads and downloads. Powered by `pydub` + `ffmpeg` (Docker installs ffmpeg in the runtime). Output format = upload format.
- **Stereo-preserving.** Stereo input is embedded into BOTH channels with the same PN sequence (synchronized payload). On detect, both channel envelopes are averaged → ~2x SNR boost.
- **Multi-pass embed (loophole upgrade).** Multiple frame offsets carry the same PN so a single-attack hole leaves other passes readable. Default `pass_count=3`.
- **Forward error correction.** Each PN bit is held for `repetition_factor=3` frames; majority-vote on detect. Survives partial frame loss from lossy compression.
- **Time-warp tolerance.** Detect runs a small bank of resampled envelopes (±2%, ±4%) so ±2% radio/streaming normalization doesn't shift the PN out of phase.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/watermark/embed` | multipart: `audio` (WAV), `release_id`, `wallet_id`, optional `alpha` | watermarked WAV bytes + headers: `X-Wallet-Fingerprint`, `X-Release-Id`, `X-Master-Sha256`, `X-Derivative-Sha256`, `X-Alpha` |
| POST | `/api/v1/watermark/detect` | multipart: `audio` (WAV), optional `release_id` | JSON: `{ matched, wallet_id, wallet_fingerprint, correlation, confidence, wallets_searched, threshold }` |
| GET | `/api/v1/health` | — | `{ status, service }` |
| GET | `/api/v1/version` | — | `{ version, pn_length, secret_set_from_env }` |

The URL prefix is `/api/v1/` so a future breaking change can ship at `/api/v2/` alongside (strangler fig, per `fortune-500-upgrade-discipline`).

## Configuration

Environment variables:

| Var | Default | What |
|---|---|---|
| `NFTONES_WATERMARK_SECRET` | `dev-secret-...` (dev only) | Master key for HMAC-SHA256 PN derivation. **MUST be set from a real secrets manager in prod.** If this leaks, an attacker who knows a wallet ID can forge watermarks. |
| `NFTONES_WATERMARK_DB` | `<service-dir>/data/watermarks.db` | SQLite path |
| `NFTONES_PN_LENGTH` | `1024` | PN sequence length in samples — longer = stronger but slightly slower correlation |

## Local development

```bash
cd C:/Users/chaza/NFTones/services/audio_watermarker
python -m venv .venv
source .venv/Scripts/activate           # Windows Git Bash
pip install -r requirements-dev.txt
pytest -v                                # run the test suite
uvicorn src.api:app --reload --port 8500 # start the API
```

## Docker

```bash
docker compose up --build
# then:
curl http://localhost:8500/api/v1/health
```

In production, override the secret:

```bash
NFTONES_WATERMARK_SECRET="$(openssl rand -base64 32)" docker compose up -d
```

## Smoke test (embed → detect roundtrip)

```bash
# 1. Generate a 5-second tone WAV
python -c "
import numpy as np, soundfile as sf
sr=44100; t=np.linspace(0,5,sr*5,endpoint=False).astype('float32')
audio=0.3*np.sin(2*np.pi*1000*t)
sf.write('test.wav', audio, sr)
"

# 2. Embed wallet-A's watermark
curl -X POST http://localhost:8500/api/v1/watermark/embed \
  -F audio=@test.wav -F release_id=demo-001 -F wallet_id=wallet-A \
  -o watermarked.wav -D headers.txt
cat headers.txt | grep -E "X-(Wallet|Master|Derivative)"

# 3. Detect — should return wallet-A
curl -X POST http://localhost:8500/api/v1/watermark/detect \
  -F audio=@watermarked.wav -F release_id=demo-001
# → { "matched": true, "wallet_id": "wallet-A", "confidence": "high", ... }
```

## Tests — what they prove

Run `pytest -v` to see all of these:

- **`test_crypto.py`** — PN derivation is deterministic, differs per wallet, differs per secret, is ±1 only, balanced, rejects invalid inputs
- **`test_watermarker.py::test_embed_*`** — embed preserves length, dtype, level; distortion is small
- **`test_watermarker.py::test_detect_finds_own_watermark`** — the core claim: a wallet's watermark is detected as that wallet's
- **`test_watermarker.py::test_detect_rejects_unrelated_audio`** — un-watermarked audio doesn't match anyone (no false positives on innocent audio)
- **`test_watermarker.py::test_detect_distinguishes_two_buyers`** — A's copy attributes to A, B's copy attributes to B
- **`test_watermarker.py::test_survives_volume_scaling`** — half-volume attack doesn't defeat detection
- **`test_watermarker.py::test_survives_additive_noise`** — -30dB additive noise (typical re-encode artifact) doesn't defeat detection
- **`test_watermarker.py::test_threshold_blocks_random_audio`** — pure noise doesn't false-match

Plus `test_known_limit_aggressive_lowpass` — marked `xfail`, documents that severe low-pass DOES defeat the watermark. Honesty in code.

### Attack survival matrix (v2)

Measured on `medium_realistic_music` (15s multi-harmonic + drums + reverb @ 44.1 kHz). Each row is a test in `tests/test_attacks.py`. All pass at default params (alpha=0.05, threshold=0.15, pass_count=3, repetition_factor=3).

| Attack | Result | Notes |
|---|---|---|
| MP3 128 kbps roundtrip | PASS | Mid-band magnitudes preserved by codec |
| MP3 320 kbps roundtrip | PASS | — |
| AAC 128 kbps roundtrip | PASS | Via ffmpeg `ipod` (mp4/aac) muxer |
| Stereo embed + detect | PASS | Same PN both channels; envelopes averaged |
| Time-stretch +2% | PASS | Detector resampling bank ±2%, ±4% |
| Time-stretch −2% | PASS | — |
| Bandpass 500–6000 Hz (phone speaker) | PASS | Mid-band carrier inside passband |
| Volume halving | PASS | Normalized correlation is amplitude-invariant |
| Additive white noise −30 dB | PASS | — |
| Aggressive lowpass <500 Hz | **XFAIL (known)** | Strips the mid-band carrier; physical limit |
| Pure noise input | PASS (no-match) | No false positives |
| Realistic-music false-positive | PASS (no-match) | Un-watermarked music doesn't match anyone |

## Integration into the $LVTN platform (the adapter, separate repo)

This service is meant to be called from `/opt/leviathantalon/server/integrations/nftones/client.ts`. The adapter:

1. Authenticates the inbound request at the $LVTN edge (Bearer token, wallet signature, whatever your auth is)
2. Streams the audio to this service
3. Records the resulting `derivative_sha256` to the $LVTN database for the user's purchase record
4. Pipes the watermarked bytes back to the user

That adapter is built as a separate change. See `C:/Users/chaza/NFTones/MODULE_BOUNDARIES.md` for the full contract.

## Future work (tracked, not done)

1. MP3/AAC input via pydub + ffmpeg (v2)
2. Stereo-preserving embed (v2)
3. Postgres backend for large catalogs (v3)
4. Background-job detection for big-catalog scans (v3)
5. Wrap mature `audiowmark` library as a higher-robustness backend option (v3)
6. Telemetry: correlation distribution per release, attack-resistance metrics

Each is one to two days. Sequenced based on which $LVTN flows are blocked.
