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
from .watermarker import (
    WatermarkParams,
    detect,
    detect_stereo,
    embed,
    embed_stereo,
)

# Optional pydub for mp3/aac/flac. ffmpeg must be installed in the runtime.
try:
    from pydub import AudioSegment  # type: ignore

    _PYDUB_OK = True
except Exception:
    AudioSegment = None  # type: ignore
    _PYDUB_OK = False


_FORMAT_ALIASES = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    # Video formats
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/webm": "webm",
    "video/x-msvideo": "avi",
}


def _format_from_filename(name: str | None) -> str | None:
    if not name:
        return None
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in {"wav", "mp3", "aac", "m4a", "flac", "mp4", "mov", "mkv", "webm", "avi"}:
        return ext
    return None


def _resolve_format(content_type: str | None, filename: str | None) -> str:
    """Pick a canonical format tag for in/out encoding."""
    ext = _format_from_filename(filename)
    if ext:
        return ext
    if content_type and content_type.lower() in _FORMAT_ALIASES:
        return _FORMAT_ALIASES[content_type.lower()]
    return "wav"


def _load_audio(
    blob: bytes, content_type: str | None, filename: str | None
) -> tuple[np.ndarray, int, str, bool]:
    """Decode any of wav/mp3/aac/m4a/flac/mp4/mov/mkv/webm/avi → (samples, sr, fmt, is_stereo).

    Returns:
        samples: (n,) mono or (n,2) stereo float32 in [-1, 1]
        sr: sample rate
        fmt: canonical format tag
        is_stereo: True if the source was stereo (we preserve it)
    """
    fmt = _resolve_format(content_type, filename)
    if fmt == "wav":
        try:
            audio, sr = sf.read(io.BytesIO(blob), dtype="float32", always_2d=False)
        except Exception as e:
            raise HTTPException(400, f"Could not parse WAV: {e}")
        is_stereo = audio.ndim == 2 and audio.shape[1] == 2
        if len(audio) == 0:
            raise HTTPException(400, "Empty audio stream.")
        return audio.astype(np.float32), int(sr), fmt, is_stereo

    # mp3 / aac / m4a / flac / video via pydub+ffmpeg
    if not _PYDUB_OK:
        raise HTTPException(
            415,
            f"format={fmt} requires pydub+ffmpeg. Install ffmpeg and `pip install pydub`.",
        )
    try:
        seg = AudioSegment.from_file(io.BytesIO(blob), format=fmt)
    except IndexError:
        raise HTTPException(400, f"No audio track found in the uploaded {fmt} file.")
    except Exception as e:
        raise HTTPException(400, f"Could not decode {fmt}: {e}")
    sr = int(seg.frame_rate)
    channels = int(seg.channels)
    
    # Extract raw samples
    raw_data = seg.get_array_of_samples()
    if len(raw_data) == 0:
        raise HTTPException(
            400,
            f"No audio track or empty audio stream found in the uploaded {fmt} file."
        )
        
    samples = np.array(raw_data, dtype=np.float32)
    # Normalize integer PCM into [-1, 1]
    max_amp = float(1 << (8 * seg.sample_width - 1))
    samples = samples / max_amp
    if channels == 2:
        samples = samples.reshape(-1, 2)
        is_stereo = True
    else:
        is_stereo = False
    return samples, sr, fmt, is_stereo


def _encode_audio(
    samples: np.ndarray, sr: int, fmt: str
) -> tuple[bytes, str]:
    """Encode float32 samples back to the requested format.

    Returns (bytes, mime_type).
    """
    if fmt == "wav":
        buf = io.BytesIO()
        sf.write(buf, samples, sr, format="WAV", subtype="FLOAT")
        return buf.getvalue(), "audio/wav"

    if not _PYDUB_OK:
        raise HTTPException(415, f"encoding {fmt} requires pydub+ffmpeg")

    # pydub wants int16 PCM. Clip + scale.
    arr = np.clip(samples, -1.0, 1.0)
    if arr.ndim == 2:
        channels = arr.shape[1]
        interleaved = (arr * 32767.0).astype(np.int16).tobytes()
    else:
        channels = 1
        interleaved = (arr * 32767.0).astype(np.int16).tobytes()
    seg = AudioSegment(
        data=interleaved,
        sample_width=2,
        frame_rate=sr,
        channels=channels,
    )
    buf = io.BytesIO()
    if fmt == "mp3":
        seg.export(buf, format="mp3", bitrate="192k")
        mime = "audio/mpeg"
    elif fmt == "aac" or fmt == "m4a":
        # ffmpeg-aac via mp4 container (most portable)
        seg.export(buf, format="ipod", bitrate="192k")  # 'ipod' = mp4/aac
        mime = "audio/mp4"
    elif fmt == "flac":
        seg.export(buf, format="flac")
        mime = "audio/flac"
    return buf.getvalue(), mime


def _encode_video_with_audio(
    samples: np.ndarray, sr: int, fmt: str, video_bytes: bytes
) -> tuple[bytes, str]:
    """Mux watermarked audio back into the original video container using ffmpeg."""
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
        audio_path = temp_audio.name
    
    try:
        sf.write(audio_path, samples, sr, format="WAV", subtype="FLOAT")
        
        with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as temp_video:
            video_path = temp_video.name
            temp_video.write(video_bytes)
            
        with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as temp_output:
            output_path = temp_output.name
            
        if fmt == "webm":
            acodec = "libopus"
            mime = "video/webm"
        elif fmt == "mp4":
            acodec = "aac"
            mime = "video/mp4"
        elif fmt == "mov":
            acodec = "aac"
            mime = "video/quicktime"
        elif fmt == "mkv":
            acodec = "aac"
            mime = "video/x-matroska"
        elif fmt == "avi":
            acodec = "mp3"
            mime = "video/x-msvideo"
        else:
            acodec = "aac"
            mime = f"video/{fmt}"

        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-i", audio_path,
            "-map", "0:v?",          # Map video stream from input 0 if present
            "-map", "1:a:0",         # Map audio stream from input 1
            "-c:v", "copy",          # Direct stream copy video (no re-encoding)
            "-c:a", acodec,          # Encode audio to appropriate codec
            "-y",                    # Overwrite output file
            output_path
        ]
        
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        
        with open(output_path, "rb") as f:
            out_bytes = f.read()
            
        return out_bytes, mime
        
    except Exception as e:
        raise HTTPException(500, f"Failed to mux watermarked audio into video container: {e}")
    finally:
        for p in (audio_path, video_path, output_path):
            try:
                os.unlink(p)
            except Exception:
                pass

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
    """Legacy WAV-only loader. Kept for backward compatibility with old tests."""
    try:
        audio, sr = sf.read(io.BytesIO(blob), dtype="float32", always_2d=False)
    except Exception as e:
        raise HTTPException(400, f"Could not parse audio (WAV required): {e}")
    if audio.ndim == 2:
        audio = audio.mean(axis=1).astype(np.float32)
    return audio, int(sr)


def _sha256_audio(audio: np.ndarray, sample_rate: int) -> str:
    """SHA-256 of the canonical (float32, native byte order) audio."""
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
    """Embed a watermark and return the watermarked audio in the SAME format uploaded."""
    blob = await audio.read()
    samples, sr, fmt, is_stereo = _load_audio(
        blob, audio.content_type, audio.filename
    )
    master_hash = _sha256_audio(samples, sr)

    params = WatermarkParams(sample_rate=sr)
    if alpha is not None:
        if not 0.001 <= alpha <= 0.5:
            raise HTTPException(400, "alpha must be in [0.001, 0.5]")
        params = WatermarkParams(sample_rate=sr, alpha=alpha)

    pn = derive_pn_sequence(wallet_id, _SECRET, length=_PN_LENGTH)
    if is_stereo:
        watermarked = embed_stereo(samples, pn, params)
    else:
        # If we got mono-as-2D (unlikely) flatten.
        mono = samples if samples.ndim == 1 else samples.mean(axis=1).astype(np.float32)
        watermarked = embed(mono, pn, params)
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
            is_stereo=is_stereo,
        )
    except Exception as e:
        # SQLite uniqueness violation, etc.
        raise HTTPException(409, f"Could not record watermark: {e}")

    if fmt in {"mp4", "mov", "mkv", "webm", "avi"}:
        out_bytes, mime = _encode_video_with_audio(watermarked, sr, fmt, blob)
    else:
        out_bytes, mime = _encode_audio(watermarked, sr, fmt)
    buf = io.BytesIO(out_bytes)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type=mime,
        headers={
            "X-Wallet-Fingerprint": wallet_fingerprint(wallet_id),
            "X-Release-Id": release_id,
            "X-Master-Sha256": master_hash,
            "X-Derivative-Sha256": derivative_hash,
            "X-Alpha": str(params.alpha),
            "X-Format": fmt,
            "X-Is-Stereo": "1" if is_stereo else "0",
            "Content-Disposition": f'attachment; filename="{release_id}-{wallet_fingerprint(wallet_id)}.{fmt}"',
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
    samples, sr, fmt, is_stereo = _load_audio(
        blob, audio.content_type, audio.filename
    )

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
    if is_stereo and samples.ndim == 2:
        result = detect_stereo(samples, candidates, params)
    else:
        mono = samples if samples.ndim == 1 else samples.mean(axis=1).astype(np.float32)
        result = detect(mono, candidates, params)

    return {
        "matched": result.matched,
        "wallet_id": result.wallet_id,
        "wallet_fingerprint": wallet_fingerprint(result.wallet_id) if result.wallet_id else None,
        "correlation": result.correlation,
        "confidence": result.confidence,
        "wallets_searched": len(wallets),
        "threshold": params.detection_threshold,
    }
