"""Deterministic pseudo-random sequence derivation from wallet IDs.

Why this matters: every wallet must get a UNIQUE watermark pattern so that
correlation-based detection can attribute a leaked file back to one buyer.
The pattern must be reproducible from the wallet ID alone (so we don't have
to store huge binary blobs per wallet — only the wallet ID + a master secret).

Security note: the `secret_key` is a server-side master secret. If it leaks,
an attacker who knows a wallet ID can FORGE a watermark for that wallet
(making it look like the wallet leaked something it didn't). Keep it secret.
"""
from __future__ import annotations

import hashlib
import hmac

import numpy as np


def derive_pn_sequence(
    wallet_id: str,
    secret_key: bytes,
    length: int = 1024,
) -> np.ndarray:
    """Derive a deterministic ±1 pseudo-random sequence for a wallet.

    Uses HMAC-SHA256 with the master secret as the key and the wallet ID as
    the message, repeated until we have `length` bytes of output, then mapped
    to ±1.

    Args:
        wallet_id: opaque wallet identifier (e.g. base58 Solana pubkey)
        secret_key: server-side master secret (≥32 bytes recommended)
        length: number of ±1 samples to produce

    Returns:
        np.ndarray of shape (length,), dtype int8, values in {-1, +1}
    """
    if not wallet_id:
        raise ValueError("wallet_id must be non-empty")
    if len(secret_key) < 16:
        raise ValueError("secret_key must be at least 16 bytes")

    out_bytes = bytearray()
    counter = 0
    while len(out_bytes) < length:
        msg = wallet_id.encode("utf-8") + counter.to_bytes(4, "big")
        out_bytes.extend(hmac.new(secret_key, msg, hashlib.sha256).digest())
        counter += 1

    # Map each byte to {-1, +1} by taking its high bit
    arr = np.frombuffer(bytes(out_bytes[:length]), dtype=np.uint8)
    pn = np.where(arr >= 128, 1, -1).astype(np.int8)
    return pn


def wallet_fingerprint(wallet_id: str) -> str:
    """Short stable fingerprint for a wallet (logging / record IDs).

    NOT for security — purely human-readable identifier.
    """
    return hashlib.sha256(wallet_id.encode("utf-8")).hexdigest()[:16]
