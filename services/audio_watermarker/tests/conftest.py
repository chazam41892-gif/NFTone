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


def _make_realistic_music(duration_s: float, seed: int = 7) -> np.ndarray:
    """Closer to real music: fundamental + harmonics, drum impulses, reverb tail."""
    rng = np.random.default_rng(seed)
    n = int(SAMPLE_RATE * duration_s)
    t = np.linspace(0, duration_s, n, endpoint=False, dtype=np.float32)
    # Harmonic stack — fundamental + 3 overtones.
    tonal = (
        0.30 * np.sin(2 * np.pi * 200 * t)
        + 0.22 * np.sin(2 * np.pi * 500 * t)
        + 0.18 * np.sin(2 * np.pi * 1200 * t)
        + 0.12 * np.sin(2 * np.pi * 2400 * t)
    ).astype(np.float32)
    # Drum-like impulse train (every ~0.5s, decaying).
    drums = np.zeros(n, dtype=np.float32)
    period = int(SAMPLE_RATE * 0.5)
    for k in range(0, n, period):
        env = np.exp(-np.linspace(0, 6, min(period, n - k)).astype(np.float32))
        drums[k : k + len(env)] += env * 0.25
    # Light reverb tail (simple feedback comb filter approximation).
    reverb = np.zeros(n, dtype=np.float32)
    delay = int(SAMPLE_RATE * 0.07)
    if delay < n:
        reverb[delay:] += tonal[: n - delay] * 0.18
    noise = 0.03 * rng.standard_normal(n).astype(np.float32)
    audio = tonal + drums + reverb + noise
    audio = audio.astype(np.float32)
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio /= peak * 1.05
    return audio


@pytest.fixture
def realistic_music() -> np.ndarray:
    """4-second multi-harmonic + drums + reverb signal at 44.1 kHz mono."""
    return _make_realistic_music(duration_s=4.0)


@pytest.fixture
def medium_realistic_music() -> np.ndarray:
    """15-second realistic music — used for attack-roundtrip tests."""
    return _make_realistic_music(duration_s=15.0)


@pytest.fixture
def medium_stereo() -> np.ndarray:
    """Stereo (n,2) — left channel slightly different from right."""
    left = _make_realistic_music(duration_s=12.0, seed=11)
    right = _make_realistic_music(duration_s=12.0, seed=13)
    n = min(len(left), len(right))
    return np.stack([left[:n], right[:n]], axis=1).astype(np.float32)
