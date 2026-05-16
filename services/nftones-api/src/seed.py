"""Seed the SQLite database from the frozen mock-data/data.json fixture.

Idempotent: on each boot, if the database is empty we populate from the
fixture. If any rows exist, we leave the database alone (so operator-mutated
state in dev survives restarts).

The fixture is the canonical Phase-1 dataset, frozen by user decision —
data.json mirrors mock-data/data.js byte-for-content. Phase 5+ replaces
this seed with real writes from the wallet-auth flow.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from sqlmodel import Session, select

from .db import engine, init_db
from .models import Balance, Evidence, Grant, Release, Scan, TokenEvent, Wallet

log = logging.getLogger(__name__)

_FIXTURE_PATH = Path(
    os.environ.get(
        "NFTONES_API_FIXTURE",
        str(Path(__file__).resolve().parents[3] / "mock-data" / "data.json"),
    )
)


def _load_fixture() -> dict:
    if not _FIXTURE_PATH.exists():
        raise FileNotFoundError(
            f"Fixture not found at {_FIXTURE_PATH}. Set NFTONES_API_FIXTURE "
            f"or ensure mock-data/data.json is mounted into the container."
        )
    with _FIXTURE_PATH.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data


def seed_if_empty() -> dict:
    """Populate empty DB from the fixture. Returns a counts dict for logging."""
    init_db()
    counts = {"wallets": 0, "releases": 0, "grants": 0, "scans": 0, "evidence": 0, "token_events": 0}

    with Session(engine) as s:
        existing = s.exec(select(Release).limit(1)).first()
        if existing is not None:
            log.info("seed: database already populated; skipping fixture load")
            return counts

        fixture = _load_fixture()

        for w in fixture.get("wallets", []):
            s.add(Wallet(**w))
            counts["wallets"] += 1

        for r in fixture.get("releases", []):
            s.add(Release(**r))
            counts["releases"] += 1

        for g in fixture.get("grants", []):
            s.add(Grant(**g))
            counts["grants"] += 1

        for sc in fixture.get("scans", []):
            s.add(Scan(**sc))
            counts["scans"] += 1

        for ev in fixture.get("evidenceReports", []):
            s.add(Evidence(**ev))
            counts["evidence"] += 1

        for te in fixture.get("tokenEvents", []):
            s.add(TokenEvent(**te))
            counts["token_events"] += 1

        bal = fixture.get("balances", {})
        s.add(Balance(owner="self", ktrs=bal.get("KTRS", "0.00"), lvtn=bal.get("LVTN", "0.00")))

        s.commit()
        log.info("seed: loaded fixture %s", counts)

    return counts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(seed_if_empty())
