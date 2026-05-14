"""Tests for the core watermarker.

The key tests are the roundtrip ones:
    embed(audio_A) → detect against [wallet_A, wallet_B, wallet_C] → wallet_A

These must pass for the service to be considered "working". Anything less
is a lie about its function.
"""
from __future__ import annotations

import numpy as np
import pytest

from src.crypto import derive_pn_sequence
from src.watermarker import (
    DEFAULT_DETECTION_THRESHOLD,
    WatermarkParams,
    detect,
    embed,
)


# ----------------------------- preservation tests ----------------------------


def test_embed_preserves_length(short_audio, secret_key):
    pn = derive_pn_sequence("w1", secret_key)
    out = embed(short_audio, pn)
    assert out.shape == short_audio.shape


def test_embed_preserves_dtype(short_audio, secret_key):
    pn = derive_pn_sequence("w1", secret_key)
    out = embed(short_audio, pn)
    assert out.dtype == np.float32


def test_embed_does_not_blow_up_levels(short_audio, secret_key):
    """Watermarked audio must stay in legal [-1, 1] range."""
    pn = derive_pn_sequence("w1", secret_key)
    out = embed(short_audio, pn, WatermarkParams(alpha=0.1))
    assert np.max(np.abs(out)) <= 1.0


def test_embed_perturbation_is_small(medium_audio, secret_key):
    """Mean absolute change should be small — large change = audible."""
    pn = derive_pn_sequence("w1", secret_key)
    out = embed(medium_audio, pn, WatermarkParams(alpha=0.05))
    rms_diff = float(np.sqrt(np.mean((out - medium_audio) ** 2)))
    rms_orig = float(np.sqrt(np.mean(medium_audio ** 2)))
    # The perturbation should be < 10% of original RMS.
    assert rms_diff / rms_orig < 0.10, (
        f"Watermark distortion too high: {rms_diff/rms_orig:.3f} RMS ratio"
    )


# ----------------------------- roundtrip tests ------------------------------


def test_detect_finds_own_watermark(medium_audio, secret_key):
    """Embed wallet-A's watermark, detect against {A,B,C} → A wins."""
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)
    pn_c = derive_pn_sequence("wallet-C", secret_key)

    watermarked = embed(medium_audio, pn_a)
    result = detect(
        watermarked,
        [("wallet-A", pn_a), ("wallet-B", pn_b), ("wallet-C", pn_c)],
    )

    assert result.matched, f"Failed to detect any wallet (correlation={result.correlation})"
    assert result.wallet_id == "wallet-A", (
        f"Detected wrong wallet: {result.wallet_id} (corr={result.correlation})"
    )


def test_detect_rejects_unrelated_audio(medium_audio, secret_key):
    """Audio that was never watermarked should not match anyone."""
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)

    result = detect(medium_audio, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    # We expect no match — correlation should be below threshold.
    assert not result.matched, (
        f"False positive on un-watermarked audio: matched {result.wallet_id} "
        f"with correlation={result.correlation}"
    )


def test_detect_distinguishes_two_buyers(medium_audio, secret_key):
    """Embed A's watermark, then B's, into two separate copies.
    Detection on each copy must return the right buyer."""
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)

    copy_a = embed(medium_audio, pn_a)
    copy_b = embed(medium_audio, pn_b)

    candidates = [("wallet-A", pn_a), ("wallet-B", pn_b)]
    res_a = detect(copy_a, candidates)
    res_b = detect(copy_b, candidates)

    assert res_a.wallet_id == "wallet-A", (
        f"Mis-attributed A's copy: got {res_a.wallet_id} corr={res_a.correlation}"
    )
    assert res_b.wallet_id == "wallet-B", (
        f"Mis-attributed B's copy: got {res_b.wallet_id} corr={res_b.correlation}"
    )


# ----------------------------- robustness tests -----------------------------
# These are the tests that prove the watermark survives realistic attacks.
# Each documents the attack and the survival expectation.


def test_survives_volume_scaling(medium_audio, secret_key):
    """Halving (or doubling) the volume should NOT defeat the watermark.
    Volume is the simplest attack — a watermark that can't survive it is useless."""
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)

    watermarked = embed(medium_audio, pn_a)
    attacked = watermarked * 0.5  # half-volume attack

    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"Watermark did not survive volume halving "
        f"(detected={result.wallet_id}, corr={result.correlation})"
    )


def test_survives_additive_noise(medium_audio, secret_key):
    """Adding white noise at -30 dB should not defeat the watermark.
    Real-world leaks pick up background noise from re-encoding."""
    rng = np.random.default_rng(0)
    pn_a = derive_pn_sequence("wallet-A", secret_key)
    pn_b = derive_pn_sequence("wallet-B", secret_key)

    watermarked = embed(medium_audio, pn_a)
    rms = float(np.sqrt(np.mean(watermarked ** 2)))
    noise = rng.standard_normal(len(watermarked)).astype(np.float32) * (rms * 0.03)  # -30 dB
    attacked = watermarked + noise

    result = detect(attacked, [("wallet-A", pn_a), ("wallet-B", pn_b)])
    assert result.wallet_id == "wallet-A", (
        f"Watermark did not survive -30dB additive noise "
        f"(detected={result.wallet_id}, corr={result.correlation})"
    )


def test_threshold_blocks_random_audio(medium_audio, secret_key):
    """A pure-noise signal should NOT match any wallet.
    If it does, the threshold is too low."""
    rng = np.random.default_rng(0)
    pure_noise = rng.standard_normal(len(medium_audio)).astype(np.float32) * 0.3

    pn_a = derive_pn_sequence("wallet-A", secret_key)
    result = detect(pure_noise, [("wallet-A", pn_a)])

    # Pure noise should mostly NOT match. Some random correlation is expected
    # but should rarely cross the threshold.
    assert not result.matched, (
        f"False positive on pure noise: matched with correlation={result.correlation}"
    )


# ------------------------- aggressive-lowpass attack ------------------------
# Was xfail in v2 (mid-band carrier alone). v3 added a redundant low-band
# carrier (100-450 Hz) that survives an 8th-order Butterworth lowpass at
# 500 Hz, so this is now a normal pass — keep it as a regression guard
# against anyone disabling the low-band by mistake.


def test_survives_aggressive_lowpass(medium_audio, secret_key):
    from scipy.signal import butter, sosfilt

    pn_a = derive_pn_sequence("wallet-A", secret_key)
    watermarked = embed(medium_audio, pn_a)
    sos = butter(8, 500.0, btype="low", fs=44100, output="sos")
    attacked = sosfilt(sos, watermarked).astype(np.float32)

    result = detect(attacked, [("wallet-A", pn_a)])
    assert result.wallet_id == "wallet-A", (
        f"Watermark did not survive 500 Hz lowpass — low-band carrier may be "
        f"disabled or misconfigured (got wallet_id={result.wallet_id}, "
        f"corr={result.correlation})"
    )
