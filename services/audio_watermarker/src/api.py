"""FastAPI surface for the watermarker.

Endpoints (versioned — strangler-fig friendly per fortune-500-upgrade-discipline):
    POST /api/v1/watermark/embed   — multipart: audio (wav), release_id, wallet_id
    POST /api/v1/watermark/detect  — multipart: audio (wav), [release_id]
    GET  /api/v1/health
    GET  /api/v1/version

Honest scope:
    - WAV only in v1 (no ffmpeg dependency, works on Windows out of the box).
      MP3 support comes via pydub+ffmpeg in v2 — separate change.
    - Mono only in v1. Stereo input is mixed to mono before embedding.
      Stereo-preserving embedding is v2.
    - Synchronous embed/detect. For large catalogs, detect against thousands
      of wallets will be slow — that's a worker-queue job in v3.

Auth: NONE in this service. The $LVTN adapter is expected to authenticate
at its edge and forward only trusted requests. Do not expose this service
directly to the internet.
"""
from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from . import __version__
from .crypto import derive_pn_sequence, wallet_fingerprint
from .storage import WatermarkStore
from .watermarker import WatermarkParams, detect, embed

# Master secret for PN sequence derivation. In production this MUST come
# from a secrets manager (Vault, AWS Secrets Manager, Cloudflare Worker
# secrets, etc.) and rotate. For local dev it falls back to a fixed dev key.
_SECRET = os.environ.get(
    "NFTONES_WATERMARK_SECRET",
    "dev-secret-do-not-use-in-prod-32-bytes-min!",
).encode("utf-8")

_DB_PATH = os.environ.get(
    "NFTONES_WATERMARK_DB",
    str(Path(__file__).resolve().parent.parent / "data" / "watermarks.db"),
)

_PN_LENGTH = int(os.environ.get("NFTONES_PN_LENGTH", "1024"))

app = FastAPI(
    title="NFTones Audio Watermarker",
    version=__version__,
    description=(
        "Embed wallet-derived spread-spectrum watermarks in audio; "
        "detect which wallet a suspected leak belongs to."
    ),
)

_store = WatermarkStore(_DB_PATH)


def _load_wav(blob: bytes) -> tuple[np.ndarray, int]:
    """Load WAV bytes → (mono float32 samples in [-1,1], sample_rate)."""
    try:
        audio, sr = sf.read(io.BytesIO(blob), dtype="float32", always_2d=False)
    except Exception as e:
        raise HTTPException(400, f"Could not parse audio (WAV required): {e}")
    if audio.ndim == 2:
        # Stereo → mono. We lose stereo information; v2 will preserve it.
        audio = audio.mean(axis=1).astype(np.float32)
    return audio, int(sr)


def _sha256_audio(audio: np.ndarray, sample_rate: int) -> str:
    """SHA-256 of the canonical (float32, mono, native byte order) audio."""
    h = hashlib.sha256()
    h.update(sample_rate.to_bytes(4, "little"))
    h.update(audio.astype(np.float32).tobytes())
    return h.hexdigest()


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "service": "nftones-audio-watermarker"}


@app.get("/api/v1/version")
def version() -> dict:
    return {
        "version": __version__,
        "pn_length": _PN_LENGTH,
        "secret_set_from_env": bool(os.environ.get("NFTONES_WATERMARK_SECRET")),
    }


@app.post("/api/v1/watermark/embed")
async def embed_endpoint(
    audio: UploadFile = File(..., description="WAV audio file"),
    release_id: str = Form(..., description="Stable ID for the audio release"),
    wallet_id: str = Form(..., description="Buyer's wallet identifier"),
    alpha: Optional[float] = Form(None, description="Embedding strength override"),
) -> StreamingResponse:
    """Embed a watermark and return the watermarked WAV."""
    blob = await audio.read()
    samples, sr = _load_wav(blob)
    master_hash = _sha256_audio(samples, sr)

    params = WatermarkParams(sample_rate=sr)
    if alpha is not None:
        if not 0.001 <= alpha <= 0.5:
            raise HTTPException(400, "alpha must be in [0.001, 0.5]")
        params = WatermarkParams(sample_rate=sr, alpha=alpha)

    pn = derive_pn_sequence(wallet_id, _SECRET, length=_PN_LENGTH)
    watermarked = embed(samples, pn, params)
    derivative_hash = _sha256_audio(watermarked, sr)

    # Record before returning bytes — if recording fails (e.g., uniqueness
    # violation), the client gets the error instead of an orphan derivative.
    try:
        _store.record(
            release_id=release_id,
            wallet_id=wallet_id,
            master_sha256=master_hash,
            derivative_sha256=derivative_hash,
            alpha=params.alpha,
            sample_rate=sr,
            freq_lo_hz=params.freq_lo_hz,
            freq_hi_hz=params.freq_hi_hz,
            pn_length=_PN_LENGTH,
            detection_threshold=params.detection_threshold,
        )
    except Exception as e:
        # SQLite uniqueness violation, etc.
        raise HTTPException(409, f"Could not record watermark: {e}")

    # Write WAV to memory and stream back.
    buf = io.BytesIO()
    sf.write(buf, watermarked, sr, format="WAV", subtype="FLOAT")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={
            "X-Wallet-Fingerprint": wallet_fingerprint(wallet_id),
            "X-Release-Id": release_id,
            "X-Master-Sha256": master_hash,
            "X-Derivative-Sha256": derivative_hash,
            "X-Alpha": str(params.alpha),
            "Content-Disposition": f'attachment; filename="{release_id}-{wallet_fingerprint(wallet_id)}.wav"',
        },
    )


@app.post("/api/v1/watermark/detect")
async def detect_endpoint(
    audio: UploadFile = File(..., description="Suspected leaked WAV"),
    release_id: Optional[str] = Form(
        None,
        description="If known, narrow detection to wallets that bought this release. "
        "Otherwise the entire wallet catalog is searched.",
    ),
) -> dict:
    """Detect which wallet a suspected leak belongs to."""
    blob = await audio.read()
    samples, sr = _load_wav(blob)

    if release_id:
        wallets = _store.wallets_for_release(release_id)
    else:
        wallets = _store.all_wallets()

    if not wallets:
        return {
            "matched": False,
            "wallet_id": None,
            "correlation": 0.0,
            "confidence": "none",
            "wallets_searched": 0,
            "note": "no candidate wallets in store",
        }

    params = WatermarkParams(sample_rate=sr)
    candidates = ((w, derive_pn_sequence(w, _SECRET, length=_PN_LENGTH)) for w in wallets)
    result = detect(samples, candidates, params)

    return {
        "matched": result.matched,
        "wallet_id": result.wallet_id,
        "wallet_fingerprint": wallet_fingerprint(result.wallet_id) if result.wallet_id else None,
        "correlation": result.correlation,
        "confidence": result.confidence,
        "wallets_searched": len(wallets),
        "threshold": params.detection_threshold,
    }
