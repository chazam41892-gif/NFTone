"""SQLite engine + session lifecycle for nftones-api.

SQLite is the Phase-1 default (zero infra). Postgres migration is Phase-8 —
swap the DATABASE_URL env var and ship Alembic migrations at that point.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "nftones.db"
DATABASE_URL = os.environ.get(
    "NFTONES_API_DATABASE_URL",
    f"sqlite:///{_DEFAULT_DB_PATH}",
)

# SQLite needs check_same_thread=False for FastAPI's threaded request handling.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
)


def init_db() -> None:
    """Create tables. Safe to call repeatedly."""
    if DATABASE_URL.startswith("sqlite"):
        _DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency for request-scoped sessions."""
    with Session(engine) as session:
        yield session
