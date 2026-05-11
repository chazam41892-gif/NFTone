"""Tests for PN sequence derivation."""
from __future__ import annotations

import numpy as np
import pytest

from src.crypto import derive_pn_sequence, wallet_fingerprint


def test_derive_is_deterministic(secret_key):
    a = derive_pn_sequence("wallet-A", secret_key, length=512)
    b = derive_pn_sequence("wallet-A", secret_key, length=512)
    assert np.array_equal(a, b), "Same inputs must produce identical PN sequences"


def test_derive_differs_per_wallet(secret_key):
    a = derive_pn_sequence("wallet-A", secret_key, length=1024)
    b = derive_pn_sequence("wallet-B", secret_key, length=1024)
    # Two different wallets must produce sequences that differ in many positions.
    # For random ±1 sequences of length 1024, we expect ~50% agreement by
    # chance; we require > 30% disagreement (well above noise).
    disagreements = np.sum(a != b)
    assert disagreements > 300, (
        f"Two wallets produced near-identical PN sequences "
        f"(only {disagreements}/1024 differ) — derivation is broken"
    )


def test_derive_differs_per_secret():
    a = derive_pn_sequence("wallet-A", b"secret-one-padded-32-bytes-long!", length=512)
    b = derive_pn_sequence("wallet-A", b"secret-two-padded-32-bytes-long!", length=512)
    assert not np.array_equal(a, b), "Different secrets must produce different sequences"


def test_derive_values_are_pm1(secret_key):
    pn = derive_pn_sequence("wallet-X", secret_key, length=2048)
    unique = set(np.unique(pn).tolist())
    assert unique == {-1, 1}, f"PN must be ±1 only, got {unique}"


def test_derive_balanced(secret_key):
    """Roughly half +1 and half -1 — confirms no bias from byte interpretation."""
    pn = derive_pn_sequence("wallet-Y", secret_key, length=8192)
    plus = int(np.sum(pn == 1))
    expected = 4096
    # Allow 5% slack — should be much tighter in practice.
    assert abs(plus - expected) < 400, f"PN is unbalanced: {plus} +1s vs expected ~{expected}"


def test_derive_rejects_empty_wallet(secret_key):
    with pytest.raises(ValueError):
        derive_pn_sequence("", secret_key, length=512)


def test_derive_rejects_short_secret():
    with pytest.raises(ValueError):
        derive_pn_sequence("wallet-A", b"too-short", length=512)


def test_wallet_fingerprint_is_stable():
    assert wallet_fingerprint("wallet-A") == wallet_fingerprint("wallet-A")
    assert wallet_fingerprint("wallet-A") != wallet_fingerprint("wallet-B")
    assert len(wallet_fingerprint("wallet-A")) == 16
