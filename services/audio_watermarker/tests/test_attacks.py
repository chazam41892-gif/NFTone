"""Realistic attack-survival tests for the audio watermarker.

Each test models a real-world attack a music NFT actually faces in the wild:
- Re-encoding through lossy codecs (MP3, AAC)
- Stereo preservation
- Time-stretching (small radio-grade normalization)
- Bandpass / phone-speaker frequency response
- Realistic-music fixtures (not pure sinusoids)

Honest expectation: these MUST pass with the v2 multi-pass + repetition-coded
watermarker. If one cannot pass within the time budget, mark it xfail with a
real reason — do NOT delete or weaken it.
"""
from __future__ import annotations

import io

import numpy as np
import pytest
import soundfile as sf
from scipy.signal import butter, resample, sosfilt

from src.crypto import derive_pn_sequence
from src.watermarker import (
    WatermarkParams,
    detect,
    detect_stereo,
    embed,
    embed_stereo,
)


pydub = pytest.importorskip("pydub")
from pydub import AudioSegment  # noqa: E402


SR = 44_100


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _wav_roundtrip_via_pydub(audio: np.ndarray, sr: int, fmt: str, bitrate: str) -> np.ndarray:
    """Encode `audio` (float32 mono in [-1,1]) → fmt at bitrate → decode → float32."""
    arr_i16 = np.clip(audio, -1.0, 1.0)
    pcm = (arr_i16 * 32767.0).astype(np.int16).tobytes()
    seg = AudioSegment(data=pcm, sample_width=2, frame_rate=sr, channels=1)
    buf = io.BytesIO()
    if fmt == "mp3":
        seg.export(buf, format="mp3", bitrate=bitrate)
        decode_fmt = "mp3"
    elif fmt in ("aac", "m4a"):
        seg.export(buf, format="ipod", bitrate=bitrate)
        decode_fmt = "m4a"
    elif fmt == "flac":
        seg.export(buf, format="flac")
        decode_fmt = "flac"
    else:
        raise ValueError(f"unsupported fmt {fmt}")
    buf.seek(0)
    decoded = AudioSegment.from_file(buf, format=decode_fmt)
    # back to float32 mono
    if decoded.channels == 2:
        decoded = decoded.set_channels(1)
    samples = np.array(decoded.get_array_of_samples(), dtype=np.float32)
    max_amp = float(1 << (8 * decoded.sample_width - 1))
    return (samples / max_amp).astype(np.float32)


# ---------------------------------------------------------------------------
# lossy codec roundtrips
# ---------------------------------------------------------------------------


def test_mp3_128k_roundtrip(medium_realistic_music, secret_key):
    """Embed → MP3 128k → decode → detect should return wallet-A."""
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    pn_c = derive_pn_sequence("wallet-C", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    attacked = _wav_roundtrip_via_pydub(watermarked, SR, "mp3", "128k")
    result = detect(
        attacked,
        [("wallet-A", pn_a), ("wallet-B", pn_b), ("wallet-C", pn_c)],
    )
    assert result.wallet_id == "wallet-A", (
        f"MP3 128k roundtrip failed: matched={result.wallet_id} corr={result.correlation}"
    )


def test_mp3_320k_roundtrip(medium_realistic_music, secret_key):
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    attacked = _wav_roundtrip_via_pydub(watermarked, SR, "mp3", "320k")
    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"MP3 320k roundtrip failed: matched={result.wallet_id} corr={result.correlation}"
    )


def test_aac_128k_roundtrip(medium_realistic_music, secret_key):
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    attacked = _wav_roundtrip_via_pydub(watermarked, SR, "aac", "128k")
    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"AAC 128k roundtrip failed: matched={result.wallet_id} corr={result.correlation}"
    )


# ---------------------------------------------------------------------------
# stereo
# ---------------------------------------------------------------------------


def test_stereo_roundtrip(medium_stereo, secret_key):
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    pn_c = derive_pn_sequence("wallet-C", secret_key)
    watermarked = embed_stereo(medium_stereo, pn_a)
    result = detect_stereo(
        watermarked,
        [("wallet-A", pn_a), ("wallet-B", pn_b), ("wallet-C", pn_c)],
    )
    assert result.wallet_id == "wallet-A", (
        f"Stereo roundtrip failed: matched={result.wallet_id} corr={result.correlation}"
    )


# ---------------------------------------------------------------------------
# time-stretch
# ---------------------------------------------------------------------------


def test_time_stretch_plus_2pct(medium_realistic_music, secret_key):
    """Stretch +2% via scipy.signal.resample (radio-normalization scale)."""
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    new_n = int(len(watermarked) * 1.02)
    attacked = resample(watermarked, new_n).astype(np.float32)
    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"Time-stretch +2% failed: matched={result.wallet_id} corr={result.correlation}"
    )


def test_time_stretch_minus_2pct(medium_realistic_music, secret_key):
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    new_n = int(len(watermarked) * 0.98)
    attacked = resample(watermarked, new_n).astype(np.float32)
    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"Time-stretch -2% failed: matched={result.wallet_id} corr={result.correlation}"
    )


# ---------------------------------------------------------------------------
# bandpass (phone speaker)
# ---------------------------------------------------------------------------


def test_bandpass_500_6000(medium_realistic_music, secret_key):
    """Phone-speaker bandpass: keep 500-6000 Hz, kill sub-bass + high-end.

    The mid-band 1-4 kHz carrier sits squarely inside the pass band, so we
    expect this to survive cleanly.
    """
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    sos = butter(4, [500.0, 6000.0], btype="band", fs=SR, output="sos")
    attacked = sosfilt(sos, watermarked).astype(np.float32)
    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"Bandpass 500-6000 Hz failed: matched={result.wallet_id} corr={result.correlation}"
    )


# ---------------------------------------------------------------------------
# realistic-music re-runs of the core roundtrip tests
# ---------------------------------------------------------------------------


def test_core_roundtrip_on_realistic_music(medium_realistic_music, secret_key):
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    pn_c = derive_pn_sequence("wallet-C", secret_key)
    watermarked = embed(medium_realistic_music, pn_a)
    result = detect(
        watermarked,
        [("wallet-A", pn_a), ("wallet-B", pn_b), ("wallet-C", pn_c)],
    )
    assert result.wallet_id == "wallet-A", (
        f"realistic-music roundtrip failed: matched={result.wallet_id} corr={result.correlation}"
    )


def test_realistic_music_no_false_positive(medium_realistic_music, secret_key):
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    result = detect(medium_realistic_music, [("wallet-A", pn_a)])
    assert not result.matched, (
        f"False positive on un-watermarked realistic music: {result.correlation}"
    )
