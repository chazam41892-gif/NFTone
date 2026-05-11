"""Shared test fixtures.

We generate audio in-process rather than checking in a binary fixture —
keeps the repo clean and makes tests deterministic.
"""
from __future__ import annotations

import numpy as np
import pytest


SAMPLE_RATE = 44_100


def _make_music_like(duration_s: float, seed: int = 42) -> np.ndarray:
    """Synthesize a multi-tone signal that resembles music in spectral shape.

    Mix of three sinusoids in the mid-band (400 Hz, 1.2 kHz, 2.4 kHz) plus
    a small amount of white noise. The mid-band tones give the watermarker
    something to bind to.
    """
    rng = np.random.default_rng(seed)
    t = np.linspace(0, duration_s, int(SAMPLE_RATE * duration_s), endpoint=False, dtype=np.float32)
    tones = (
        0.35 * np.sin(2 * np.pi * 400 * t)
        + 0.30 * np.sin(2 * np.pi * 1_200 * t)
        + 0.25 * np.sin(2 * np.pi * 2_400 * t)
    )
    noise = 0.05 * rng.standard_normal(len(t)).astype(np.float32)
    audio = (tones + noise).astype(np.float32)
    # Normalize to a comfortable peak.
    audio /= np.max(np.abs(audio)) * 1.05
    return audio


@pytest.fixture
def short_audio() -> np.ndarray:
    """~5 seconds of music-like audio at 44.1 kHz, mono, float32."""
    return _make_music_like(duration_s=5.0)


@pytest.fixture
def medium_audio() -> np.ndarray:
    """~15 seconds — enough frames for stable correlation."""
    return _make_music_like(duration_s=15.0)


@pytest.fixture
def secret_key() -> bytes:
    return b"test-secret-32-bytes-long-padding"
