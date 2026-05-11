"""Core spread-spectrum audio watermarking.

Algorithm (high level):
    1. Compute STFT (short-time Fourier transform) of the audio
    2. Take the magnitude of mid-frequency bins (1-4 kHz —
       psychoacoustically dominant but not so high they're lost to
       lossy compression's high-cut)
    3. For each frame, multiply the magnitude by (1 + alpha * pn[i % len(pn)])
       where `pn` is the wallet's ±1 PN sequence and alpha is a small
       embedding strength (default 0.05)
    4. Reconstruct audio via inverse STFT

Detection:
    1. Compute STFT of suspect audio (may have been re-encoded, volume-
       scaled, format-converted)
    2. Take amplitude envelope of mid-frequency bins frame-by-frame
    3. Normalize (remove constant offset, scale to unit variance)
    4. Correlate against every registered wallet's PN sequence
    5. Highest normalized correlation above THRESHOLD wins

Why this works under compression: MP3/AAC preserve mid-frequency magnitude
envelopes (that's where human hearing is most sensitive — codecs work hard
to preserve them). Our payload rides on those envelopes.

Why this doesn't always work: aggressive low-pass filtering, time-stretching,
and re-recording through speakers (the analog hole) can destroy or shift
the envelope past the correlation threshold. There is NO watermark that
survives every attack — anyone who tells you otherwise is selling you
something. Be honest with users about this.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
from scipy import signal

# Default parameters — tuned for 44.1 kHz / 48 kHz audio. Override per-call
# if you need different trade-offs.
DEFAULT_SAMPLE_RATE = 44_100
DEFAULT_FRAME_SIZE = 2048  # FFT window (~46ms @ 44.1kHz)
DEFAULT_HOP_SIZE = 512  # 4x overlap
DEFAULT_FREQ_LO_HZ = 1_000.0
DEFAULT_FREQ_HI_HZ = 4_000.0
DEFAULT_ALPHA = 0.05  # embedding strength; higher = more robust but more audible
DEFAULT_DETECTION_THRESHOLD = 0.15  # normalized correlation; tune via tests


@dataclass(frozen=True)
class WatermarkParams:
    sample_rate: int = DEFAULT_SAMPLE_RATE
    frame_size: int = DEFAULT_FRAME_SIZE
    hop_size: int = DEFAULT_HOP_SIZE
    freq_lo_hz: float = DEFAULT_FREQ_LO_HZ
    freq_hi_hz: float = DEFAULT_FREQ_HI_HZ
    alpha: float = DEFAULT_ALPHA
    detection_threshold: float = DEFAULT_DETECTION_THRESHOLD


@dataclass(frozen=True)
class DetectionResult:
    wallet_id: str | None
    correlation: float
    confidence: str  # "high" | "medium" | "low" | "none"

    @property
    def matched(self) -> bool:
        return self.wallet_id is not None


def _stft(audio: np.ndarray, params: WatermarkParams) -> np.ndarray:
    """Compute STFT. Returns complex array shape (n_frames, n_freq_bins)."""
    _, _, Zxx = signal.stft(
        audio,
        fs=params.sample_rate,
        nperseg=params.frame_size,
        noverlap=params.frame_size - params.hop_size,
        return_onesided=True,
        padded=True,
        boundary="zeros",
    )
    return Zxx.T  # (frames, freq_bins)


def _istft(Zxx: np.ndarray, params: WatermarkParams, length: int) -> np.ndarray:
    """Inverse STFT. Input shape (n_frames, n_freq_bins). Returns 1-D audio."""
    _, audio = signal.istft(
        Zxx.T,
        fs=params.sample_rate,
        nperseg=params.frame_size,
        noverlap=params.frame_size - params.hop_size,
        input_onesided=True,
        boundary=True,
    )
    return audio[:length]


def _band_indices(n_bins: int, params: WatermarkParams) -> np.ndarray:
    """Indices of FFT bins inside [freq_lo, freq_hi]."""
    freqs = np.linspace(0, params.sample_rate / 2, n_bins)
    return np.where(
        (freqs >= params.freq_lo_hz) & (freqs <= params.freq_hi_hz)
    )[0]


def embed(
    audio: np.ndarray,
    pn_sequence: np.ndarray,
    params: WatermarkParams = WatermarkParams(),
) -> np.ndarray:
    """Embed a watermark in audio.

    Args:
        audio: 1-D float32 array, values in [-1, 1] (mono). For stereo, call
               once per channel.
        pn_sequence: ±1 sequence from crypto.derive_pn_sequence
        params: tuning knobs

    Returns:
        Watermarked audio, same shape/dtype as input.
    """
    if audio.ndim != 1:
        raise ValueError("embed() takes mono audio (1-D). Call per channel for stereo.")
    audio = audio.astype(np.float32, copy=False)
    original_length = len(audio)

    Zxx = _stft(audio, params)  # (frames, bins)
    n_frames, n_bins = Zxx.shape

    band = _band_indices(n_bins, params)
    if band.size == 0:
        raise ValueError(
            f"No FFT bins in band [{params.freq_lo_hz}, {params.freq_hi_hz}] Hz "
            f"at sample_rate={params.sample_rate}; check parameters."
        )

    # For each frame, perturb the band's magnitudes by alpha * pn[frame % len(pn)]
    # The phase is left alone — only magnitudes carry the payload.
    magnitudes = np.abs(Zxx[:, band])
    phases = np.angle(Zxx[:, band])

    pn_repeated = np.tile(pn_sequence, (n_frames // len(pn_sequence)) + 1)[:n_frames]
    perturb = 1.0 + params.alpha * pn_repeated.astype(np.float32)
    magnitudes = magnitudes * perturb[:, np.newaxis]

    Zxx[:, band] = magnitudes * np.exp(1j * phases)

    watermarked = _istft(Zxx, params, original_length)
    # Clip to legal range — guard against overshoot from the perturbation.
    np.clip(watermarked, -1.0, 1.0, out=watermarked)
    return watermarked.astype(np.float32)


def _envelope(audio: np.ndarray, params: WatermarkParams) -> np.ndarray:
    """Mid-frequency magnitude envelope, per frame. Shape (n_frames,)."""
    Zxx = _stft(audio, params)
    n_bins = Zxx.shape[1]
    band = _band_indices(n_bins, params)
    if band.size == 0:
        return np.zeros(Zxx.shape[0], dtype=np.float32)
    # Mean magnitude across the band, per frame.
    return np.abs(Zxx[:, band]).mean(axis=1).astype(np.float32)


def _normalized_correlation(envelope: np.ndarray, pn: np.ndarray) -> float:
    """Normalized cross-correlation between envelope and tiled PN sequence.

    Returns a scalar in roughly [-1, 1]; positive means the envelope's
    deviations align with the PN sequence.
    """
    if len(envelope) < 8:
        return 0.0

    # Detrend (remove DC offset) so we measure deviations, not absolute level.
    env_centered = envelope - envelope.mean()
    env_std = env_centered.std()
    if env_std < 1e-9:
        return 0.0  # silence or near-silence
    env_normalized = env_centered / env_std

    pn_tiled = np.tile(pn, (len(envelope) // len(pn)) + 1)[: len(envelope)]
    pn_centered = pn_tiled - pn_tiled.mean()
    pn_std = pn_centered.std()
    if pn_std < 1e-9:
        return 0.0
    pn_normalized = pn_centered / pn_std

    return float((env_normalized * pn_normalized).mean())


def detect(
    audio: np.ndarray,
    candidates: Iterable[tuple[str, np.ndarray]],
    params: WatermarkParams = WatermarkParams(),
) -> DetectionResult:
    """Detect which (if any) candidate wallet's watermark is in the audio.

    Args:
        audio: 1-D float32 array, mono.
        candidates: iterable of (wallet_id, pn_sequence) pairs to test.
        params: tuning knobs (especially detection_threshold).

    Returns:
        DetectionResult with the best match, or wallet_id=None if no
        candidate cleared the threshold.
    """
    if audio.ndim != 1:
        raise ValueError("detect() takes mono audio (1-D).")
    audio = audio.astype(np.float32, copy=False)

    envelope = _envelope(audio, params)

    best_wallet: str | None = None
    best_corr: float = 0.0
    for wallet_id, pn in candidates:
        corr = _normalized_correlation(envelope, pn)
        if abs(corr) > abs(best_corr):
            best_corr = corr
            best_wallet = wallet_id

    abs_corr = abs(best_corr)
    if abs_corr >= params.detection_threshold:
        if abs_corr >= 2 * params.detection_threshold:
            confidence = "high"
        elif abs_corr >= 1.5 * params.detection_threshold:
            confidence = "medium"
        else:
            confidence = "low"
        return DetectionResult(
            wallet_id=best_wallet, correlation=best_corr, confidence=confidence
        )
    return DetectionResult(wallet_id=None, correlation=best_corr, confidence="none")
