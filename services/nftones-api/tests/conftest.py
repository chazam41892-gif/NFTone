"""Pytest fixtures. Each test session uses a fresh tmp-dir SQLite DB
so contract tests are deterministic and independent of dev state.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make `src` importable as a package.
SVC_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SVC_ROOT))

REPO_ROOT = SVC_ROOT.parents[1]
FIXTURE_PATH = REPO_ROOT / "mock-data" / "data.json"


@pytest.fixture(scope="session")
def app_client(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("nftones-db") / "nftones.db"
    os.environ["NFTONES_API_DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["NFTONES_API_FIXTURE"] = str(FIXTURE_PATH)

    # Import the app AFTER env is set so module-level engine picks up DB URL.
    from src.main import app  # noqa: E402

    with TestClient(app) as client:
        yield client
