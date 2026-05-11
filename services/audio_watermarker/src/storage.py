"""SQLite-backed storage for watermark records.

Schema is deliberately minimal — we store:
    - release_id: the master audio file's identifier
    - wallet_id: the buyer's wallet
    - master_sha256: hash of the original (unwatermarked) audio
    - derivative_sha256: hash of the watermarked output
    - created_at: ISO timestamp
    - alpha, sample_rate, freq_lo, freq_hi, pn_length: the parameters used,
      so detection can use the same settings even if defaults change later

We do NOT store the PN sequence — it's deterministically derivable from
(wallet_id, secret_key). Storing it would be a forensic vulnerability if
the DB leaked.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS watermark_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id TEXT NOT NULL,
    wallet_id TEXT NOT NULL,
    master_sha256 TEXT NOT NULL,
    derivative_sha256 TEXT NOT NULL,
    alpha REAL NOT NULL,
    sample_rate INTEGER NOT NULL,
    freq_lo_hz REAL NOT NULL,
    freq_hi_hz REAL NOT NULL,
    pn_length INTEGER NOT NULL,
    detection_threshold REAL NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(release_id, wallet_id)
);

CREATE INDEX IF NOT EXISTS idx_release ON watermark_records(release_id);
CREATE INDEX IF NOT EXISTS idx_wallet ON watermark_records(wallet_id);
"""


@dataclass(frozen=True)
class WatermarkRecord:
    id: int | None
    release_id: str
    wallet_id: str
    master_sha256: str
    derivative_sha256: str
    alpha: float
    sample_rate: int
    freq_lo_hz: float
    freq_hi_hz: float
    pn_length: int
    detection_threshold: float
    created_at: str


class WatermarkStore:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._cursor() as cur:
            cur.executescript(SCHEMA)

    @contextmanager
    def _cursor(self) -> Iterator[sqlite3.Cursor]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            yield cur
            conn.commit()
        finally:
            conn.close()

    def record(
        self,
        release_id: str,
        wallet_id: str,
        master_sha256: str,
        derivative_sha256: str,
        alpha: float,
        sample_rate: int,
        freq_lo_hz: float,
        freq_hi_hz: float,
        pn_length: int,
        detection_threshold: float,
    ) -> int:
        """Insert a record. Returns row id. Raises if (release_id, wallet_id) already exists."""
        ts = datetime.now(timezone.utc).isoformat()
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO watermark_records
                  (release_id, wallet_id, master_sha256, derivative_sha256,
                   alpha, sample_rate, freq_lo_hz, freq_hi_hz, pn_length,
                   detection_threshold, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    release_id,
                    wallet_id,
                    master_sha256,
                    derivative_sha256,
                    alpha,
                    sample_rate,
                    freq_lo_hz,
                    freq_hi_hz,
                    pn_length,
                    detection_threshold,
                    ts,
                ),
            )
            return int(cur.lastrowid or 0)

    def wallets_for_release(self, release_id: str) -> list[str]:
        """Every wallet that has a watermarked copy of this release."""
        with self._cursor() as cur:
            cur.execute(
                "SELECT wallet_id FROM watermark_records WHERE release_id = ? ORDER BY id",
                (release_id,),
            )
            return [row["wallet_id"] for row in cur.fetchall()]

    def all_wallets(self) -> list[str]:
        """Every wallet across every release. Used when the scanner doesn't
        know which release a leak belongs to (cold-search the catalog)."""
        with self._cursor() as cur:
            cur.execute("SELECT DISTINCT wallet_id FROM watermark_records ORDER BY wallet_id")
            return [row["wallet_id"] for row in cur.fetchall()]

    def get(self, release_id: str, wallet_id: str) -> WatermarkRecord | None:
        with self._cursor() as cur:
            cur.execute(
                "SELECT * FROM watermark_records WHERE release_id=? AND wallet_id=?",
                (release_id, wallet_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            return WatermarkRecord(**dict(row))
