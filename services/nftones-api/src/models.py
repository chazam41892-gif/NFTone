"""SQLModel entities for nftones-api.

Each model mirrors the JSON shape in mock-data/data.json so the demo fixture
loads byte-for-byte. Nested/structured fields (layers_recovered, nft_history)
are stored as JSON columns to preserve the original shape — this is Phase-1
faithful-fixture behavior; Phase-6 normalizes when the watermarker provides
ground truth.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


# ---------- Wallets ----------
class Wallet(SQLModel, table=True):
    wallet: str = Field(primary_key=True)
    label: str
    tier: str  # collaborator | label_admin | reviewer | listener
    verified: bool = False
    risk: int = 0


# ---------- Releases ----------
class Release(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    artist: str
    slug: str
    duration_sec: int
    master_hash: str
    fingerprint_uri: str
    anchor_tx: str
    created_at: str
    access_count: int = 0
    renders: int = 0
    revoked: bool = False
    cover_hue: int = 0
    art_style: str = "tidal"  # tidal | ember | vapor


# ---------- Grants ----------
class Grant(SQLModel, table=True):
    id: str = Field(primary_key=True)
    release_id: str = Field(foreign_key="release.id", index=True)
    wallet: str = Field(foreign_key="wallet.wallet", index=True)
    watermark_id: str = Field(index=True)
    tier: str
    status: str  # active | revoked
    minted_at: str
    last_access: Optional[str] = None
    revoked_at: Optional[str] = None


# ---------- Scans ----------
class Scan(SQLModel, table=True):
    id: str = Field(primary_key=True)
    release_id: str = Field(foreign_key="release.id", index=True)
    release_title: str
    uploaded_at: str
    input_filename: str
    input_hash: str
    input_size_mb: float
    status: str  # matched | nomatch | pending
    confidence: int = 0
    ktrs_cost: str = "0.00"
    matched_wm_id: Optional[str] = None
    matched_grant_id: Optional[str] = None
    matched_wallet: Optional[str] = None
    transcodes_estimated: Optional[int] = None
    notes: Optional[str] = None
    # {A: bool, B: bool, C: bool} stored as JSON to preserve fixture shape
    layers_recovered: dict = Field(default_factory=dict, sa_column=Column(JSON))


# ---------- Evidence ----------
class Evidence(SQLModel, table=True):
    id: str = Field(primary_key=True)
    scan_id: str = Field(foreign_key="scan.id", index=True)
    release_id: str = Field(foreign_key="release.id", index=True)
    matched_wallet: str
    wallet_label: str
    confidence: int
    generated_at: str
    report_hash: str
    on_chain_anchor: str
    # [{event, to, at, tx}, ...]
    nft_history: list = Field(default_factory=list, sa_column=Column(JSON))


# ---------- Token events ----------
class TokenEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str  # ktrs_debit | lvtn_fee | lvtn_stake_reward
    amount: str
    token: str  # KTRS | LVTN
    reason: str
    at: str = Field(index=True)


# ---------- Balances (single-row table) ----------
class Balance(SQLModel, table=True):
    # Single row; keyed on a sentinel string.
    owner: str = Field(default="self", primary_key=True)
    ktrs: str
    lvtn: str
