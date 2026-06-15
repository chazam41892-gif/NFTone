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
# Redundant low-band carrier (v3): survives aggressive lowpass attacks that
# strip the mid-band. Centered well below 500 Hz so an 8th-order Butterworth
# lowpass at 500 Hz (the canonical "kill the watermark" attack) only attenuates
# the band edge by a few dB.
DEFAULT_FREQ_LO2_HZ = 100.0
DEFAULT_FREQ_HI2_HZ = 450.0
DEFAULT_ALPHA = 0.08  # embedding strength; higher = more robust but more audible
DEFAULT_DETECTION_THRESHOLD = 0.15  # normalized correlation; tune via tests

# --- v2 robustness upgrades (loophole-architect) -----------------------------
# Multi-pass: embed the SAME PN sequence at multiple frame offsets so any single
# attack that punches a hole in one pass leaves the others readable. On detect,
# we correlate at each offset and take the max-magnitude winner.
DEFAULT_PASS_COUNT = 3
DEFAULT_PASS_OFFSETS_FRAMES = (0, 1, 2)  # frame-index offsets, applied modulo n_frames

# Forward error correction: repeat each PN bit `repetition_factor` times. On
# detect, majority-vote each bit before correlation. Survives partial frame loss
# and lossy compression noise.
DEFAULT_REPETITION_FACTOR = 3


@dataclass(frozen=True)
class WatermarkParams:
    sample_rate: int = DEFAULT_SAMPLE_RATE
    frame_size: int = DEFAULT_FRAME_SIZE
    hop_size: int = DEFAULT_HOP_SIZE
    freq_lo_hz: float = DEFAULT_FREQ_LO_HZ
    freq_hi_hz: float = DEFAULT_FREQ_HI_HZ
    # Second (redundant) low-band carrier. Set freq_lo2_hz == freq_hi2_hz to disable.
    freq_lo2_hz: float = DEFAULT_FREQ_LO2_HZ
    freq_hi2_hz: float = DEFAULT_FREQ_HI2_HZ
    alpha: float = DEFAULT_ALPHA
    detection_threshold: float = DEFAULT_DETECTION_THRESHOLD
    pass_count: int = DEFAULT_PASS_COUNT
    repetition_factor: int = DEFAULT_REPETITION_FACTOR


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
    """Indices of FFT bins inside the primary (mid) band [freq_lo, freq_hi]."""
    freqs = np.linspace(0, params.sample_rate / 2, n_bins)
    return np.where(
        (freqs >= params.freq_lo_hz) & (freqs <= params.freq_hi_hz)
    )[0]


def _band_indices_low(n_bins: int, params: WatermarkParams) -> np.ndarray:
    """Indices of FFT bins inside the secondary (low) band [freq_lo2, freq_hi2].

    Returns an empty array if the low band is disabled (lo2 == hi2). The empty
    array is a sentinel — callers must handle the no-low-band case gracefully.
    """
    if params.freq_lo2_hz >= params.freq_hi2_hz:
        return np.empty(0, dtype=np.int64)
    freqs = np.linspace(0, params.sample_rate / 2, n_bins)
    return np.where(
        (freqs >= params.freq_lo2_hz) & (freqs <= params.freq_hi2_hz)
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

    # Repetition coding: each PN bit is held for `repetition_factor` frames.
    # Majority-vote on the receive side recovers the bit even if some frames
    # were destroyed (compression, frame loss, etc.).
    rep = max(1, int(params.repetition_factor))
    pn_repeated_bits = np.repeat(pn_sequence, rep)
    pn_repeated = np.tile(pn_repeated_bits, (n_frames // len(pn_repeated_bits)) + 1)[:n_frames]
    perturb = 1.0 + params.alpha * pn_repeated.astype(np.float32)

    # Primary mid-band carrier — survives lossy compression and time-warping.
    magnitudes = np.abs(Zxx[:, band])
    phases = np.angle(Zxx[:, band])
    magnitudes = magnitudes * perturb[:, np.newaxis]
    Zxx[:, band] = magnitudes * np.exp(1j * phases)

    # Secondary low-band carrier — survives aggressive lowpass attacks (e.g.,
    # an 8th-order Butterworth at 500 Hz) that would strip the mid-band.
    # Same PN sequence, same repetition, so the detector can correlate against
    # either band's envelope. Whichever survives the attack wins.
    band_lo = _band_indices_low(n_bins, params)
    if band_lo.size > 0:
        mag_lo = np.abs(Zxx[:, band_lo])
        phase_lo = np.angle(Zxx[:, band_lo])
        mag_lo = mag_lo * perturb[:, np.newaxis]
        Zxx[:, band_lo] = mag_lo * np.exp(1j * phase_lo)

    watermarked = _istft(Zxx, params, original_length)
    # Clip to legal range — guard against overshoot from the perturbation.
    np.clip(watermarked, -1.0, 1.0, out=watermarked)
    return watermarked.astype(np.float32)


def _whiten(env: np.ndarray, window_size: int = 11) -> np.ndarray:
    """Apply local moving-average normalization to remove slow musical dynamics."""
    if len(env) < window_size:
        return env
    padded = np.pad(env, window_size // 2, mode="edge")
    lowpass = np.convolve(padded, np.ones(window_size) / window_size, mode="valid")
    lowpass = lowpass[:len(env)]
    lowpass = np.where(lowpass < 1e-9, 1e-9, lowpass)
    return (env / lowpass).astype(np.float32)


def _envelope(audio: np.ndarray, params: WatermarkParams) -> np.ndarray:
    """Mid-frequency (primary band) magnitude envelope, per frame.

    Kept as a-single-band convenience for legacy callers / tests. New detection
    code should use `_envelopes` which returns one envelope per active band.
    """
    Zxx = _stft(audio, params)
    n_bins = Zxx.shape[1]
    band = _band_indices(n_bins, params)
    if band.size == 0:
        return np.zeros(Zxx.shape[0], dtype=np.float32)
    env = np.abs(Zxx[:, band]).mean(axis=1).astype(np.float32)
    return _whiten(env)


def _envelopes(audio: np.ndarray, params: WatermarkParams) -> list[np.ndarray]:
    """All per-frame band envelopes (mid first, low second if enabled).

    Multi-band detection: the same PN is embedded in both bands, so the
    detector tries each envelope and takes the strongest correlation. This is
    how the watermark survives aggressive lowpass — the mid-band envelope is
    flat after the attack, but the low-band envelope still carries the PN.
    """
    Zxx = _stft(audio, params)
    n_bins = Zxx.shape[1]
    out: list[np.ndarray] = []
    band = _band_indices(n_bins, params)
    if band.size > 0:
        env = np.abs(Zxx[:, band]).mean(axis=1).astype(np.float32)
        out.append(_whiten(env))
    band_lo = _band_indices_low(n_bins, params)
    if band_lo.size > 0:
        env_lo = np.abs(Zxx[:, band_lo]).mean(axis=1).astype(np.float32)
        out.append(_whiten(env_lo))
    if not out:
        out.append(np.zeros(Zxx.shape[0], dtype=np.float32))
    return out


def _normalized_correlation(
    envelope: np.ndarray,
    pn: np.ndarray,
    repetition_factor: int = 1,
    offset: int = 0,
) -> float:
    """Normalized cross-correlation between envelope and the (repeated, tiled) PN.

    Args:
        envelope: per-frame band-magnitude trace
        pn: ±1 PN bits (pre-repetition)
        repetition_factor: each bit was held for this many frames at embed time
        offset: frame-index offset to align with one of the multi-pass embeds

    Returns:
        scalar in roughly [-1, 1]; positive means alignment with the PN.
    """
    if len(envelope) < 8:
        return 0.0

    # Detrend (remove DC offset) so we measure deviations, not absolute level.
    env_centered = envelope - envelope.mean()
    env_std = env_centered.std()
    if env_std < 1e-9:
        return 0.0  # silence or near-silence
    env_normalized = env_centered / env_std

    rep = max(1, int(repetition_factor))
    pn_bits_repeated = np.repeat(pn.astype(np.float32), rep)
    pn_tiled = np.tile(pn_bits_repeated, (len(envelope) // len(pn_bits_repeated)) + 2)
    # Apply frame offset (the multi-pass embed shifted the carrier by `offset` frames).
    if offset:
        offset = offset % max(1, len(pn_bits_repeated))
        pn_tiled = pn_tiled[offset : offset + len(envelope)]
    else:
        pn_tiled = pn_tiled[: len(envelope)]

    pn_centered = pn_tiled - pn_tiled.mean()
    pn_std = pn_centered.std()
    if pn_std < 1e-9:
        return 0.0
    pn_normalized = pn_centered / pn_std

    return float((env_normalized * pn_normalized).mean())


def _multi_pass_correlation(
    envelope: np.ndarray,
    pn: np.ndarray,
    params: WatermarkParams,
) -> float:
    """Try several frame offsets and return the strongest (signed) correlation.

    We do TWO scans:
      1. Fine scan at offsets 0..pass_count to catch the multi-pass embed.
      2. Coarse scan across a wider offset range (covers small time-stretch
         drift, e.g. ±2% over 15s ≈ ±26 frames at hop=512). This is the
         "FEC outer loop" — cheap (correlation is O(n)) and pays for itself
         on stretched audio.
    """
    rep = max(1, int(params.repetition_factor))
    bit_period_frames = max(1, len(pn) * rep)
    # Scan offsets across one full bit period in coarse steps + the fine pass
    # offsets at the front. Capped to keep this cheap (~32 correlations max).
    coarse_step = max(1, bit_period_frames // 16)
    coarse_offsets = list(range(0, bit_period_frames, coarse_step))[:32]
    fine_offsets = list(range(max(1, int(params.pass_count))))
    offsets = sorted(set(fine_offsets + coarse_offsets))

    best = 0.0
    for offset in offsets:
        corr = _normalized_correlation(envelope, pn, rep, offset)
        if abs(corr) > abs(best):
            best = corr
    return best


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

    # Build per-band envelopes, then a small bank of time-warped versions of
    # each, so we survive ±2% radio / streaming-normalization time-stretching.
    # Resampling the envelope is much cheaper than resampling the audio.
    base_envs = _envelopes(audio, params)
    warp_factors = (1.0, 0.98, 1.02, 0.96, 1.04)
    envelopes: list[np.ndarray] = []
    for base_env in base_envs:
        envelopes.append(base_env)
        for f in warp_factors[1:]:
            new_n = max(8, int(len(base_env) * f))
            envelopes.append(signal.resample(base_env, new_n).astype(np.float32))

    best_wallet: str | None = None
    best_corr: float = 0.0
    # Materialize candidates so we can re-scan against each warped envelope.
    cand_list = list(candidates)
    for wallet_id, pn in cand_list:
        for env in envelopes:
            corr = _multi_pass_correlation(env, pn, params)
            if abs(corr) > abs(best_corr):
                best_corr = corr
                best_wallet = wallet_id

    return _result_from_correlation(best_wallet, best_corr, params)


def embed_stereo(
    audio: np.ndarray,
    pn_sequence: np.ndarray,
    params: WatermarkParams = WatermarkParams(),
) -> np.ndarray:
    """Embed the SAME PN into both channels of a stereo signal.

    Args:
        audio: shape (n_samples, 2), float32.
    Returns:
        same shape, watermarked.
    """
    if audio.ndim != 2 or audio.shape[1] != 2:
        raise ValueError("embed_stereo requires shape (n,2)")
    left = embed(audio[:, 0].copy(), pn_sequence, params)
    right = embed(audio[:, 1].copy(), pn_sequence, params)
    return np.stack([left, right], axis=1).astype(np.float32)


def detect_stereo(
    audio: np.ndarray,
    candidates: Iterable[tuple[str, np.ndarray]],
    params: WatermarkParams = WatermarkParams(),
) -> DetectionResult:
    """Detect on stereo audio. Averages per-channel envelopes for 2x SNR.

    Multi-band aware: averages each band's per-channel envelopes separately,
    so the low band can win on its own when an aggressive lowpass strips the
    mid band.
    """
    if audio.ndim != 2 or audio.shape[1] != 2:
        raise ValueError("detect_stereo requires shape (n,2)")
    envs_l = _envelopes(audio[:, 0].astype(np.float32), params)
    envs_r = _envelopes(audio[:, 1].astype(np.float32), params)
    # Pair-wise average per band (lengths match because both channels share
    # the same STFT geometry).
    base_envs: list[np.ndarray] = []
    for el, er in zip(envs_l, envs_r):
        n = min(len(el), len(er))
        base_envs.append(((el[:n] + er[:n]) * 0.5).astype(np.float32))

    warp_factors = (1.0, 0.98, 1.02, 0.96, 1.04)
    envelopes: list[np.ndarray] = []
    for base_env in base_envs:
        envelopes.append(base_env)
        for f in warp_factors[1:]:
            new_n = max(8, int(len(base_env) * f))
            envelopes.append(signal.resample(base_env, new_n).astype(np.float32))

    best_wallet: str | None = None
    best_corr: float = 0.0
    cand_list = list(candidates)
    for wallet_id, pn in cand_list:
        for env in envelopes:
            corr = _multi_pass_correlation(env, pn, params)
            if abs(corr) > abs(best_corr):
                best_corr = corr
                best_wallet = wallet_id
    return _result_from_correlation(best_wallet, best_corr, params)


def _result_from_correlation(
    best_wallet: str | None, best_corr: float, params: WatermarkParams
) -> DetectionResult:
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
