"""Contract tests — every Phase-1 endpoint returns the envelope and
matches the fixture's shape/count.

These tests are the regression detector. If a future change breaks an
endpoint's contract, this suite fails before deploy.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2].parent / "mock-data" / "data.json").read_text(encoding="utf-8")
)


def _ok(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("ok") is True, body
    assert "data" in body
    assert "cost_ktrs" in body
    return body["data"]


# ---- health / version ----
def test_health(app_client):
    data = _ok(app_client.get("/api/v1/health"))
    assert data["status"] == "ok"


def test_version(app_client):
    data = _ok(app_client.get("/api/v1/version"))
    assert "version" in data
    assert data["service"] == "nftones-api"


# ---- releases ----
def test_list_releases(app_client):
    data = _ok(app_client.get("/api/v1/releases"))
    assert len(data) == len(FIXTURE["releases"])
    ids = {r["id"] for r in data}
    assert ids == {r["id"] for r in FIXTURE["releases"]}


def test_get_release(app_client):
    rid = FIXTURE["releases"][0]["id"]
    data = _ok(app_client.get(f"/api/v1/releases/{rid}"))
    assert data["id"] == rid
    assert data["title"] == FIXTURE["releases"][0]["title"]


def test_get_release_404(app_client):
    resp = app_client.get("/api/v1/releases/does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "RELEASE_NOT_FOUND"


def test_release_access(app_client):
    rid = "rel_001"
    data = _ok(app_client.get(f"/api/v1/releases/{rid}/access"))
    expected = [g for g in FIXTURE["grants"] if g["release_id"] == rid]
    assert len(data) == len(expected)


# ---- grants (additive) ----
def test_list_grants(app_client):
    data = _ok(app_client.get("/api/v1/grants"))
    assert len(data) == len(FIXTURE["grants"])


def test_grants_filter(app_client):
    data = _ok(app_client.get("/api/v1/grants?release_id=rel_002&status=revoked"))
    assert all(g["release_id"] == "rel_002" and g["status"] == "revoked" for g in data)
    assert len(data) >= 1  # gr_11 is revoked


# ---- wallets ----
def test_list_wallets(app_client):
    data = _ok(app_client.get("/api/v1/wallets"))
    assert len(data) == len(FIXTURE["wallets"])


def test_get_wallet(app_client):
    addr = FIXTURE["wallets"][0]["wallet"]
    data = _ok(app_client.get(f"/api/v1/wallets/{addr}"))
    assert data["wallet"] == addr


# ---- scans ----
def test_list_scans(app_client):
    data = _ok(app_client.get("/api/v1/scans"))
    assert len(data) == len(FIXTURE["scans"])


def test_get_scan_layers_preserved(app_client):
    """Nested layers_recovered shape must survive round-trip through SQLite JSON column."""
    data = _ok(app_client.get("/api/v1/scans/scan_001"))
    assert data["layers_recovered"] == {"A": True, "B": True, "C": False}


# ---- evidence ----
def test_list_evidence(app_client):
    data = _ok(app_client.get("/api/v1/evidence"))
    assert len(data) == len(FIXTURE["evidenceReports"])


def test_evidence_nft_history_preserved(app_client):
    data = _ok(app_client.get("/api/v1/evidence/ev_001"))
    assert isinstance(data["nft_history"], list)
    assert data["nft_history"][0]["event"] == "mint"


# ---- token ----
def test_balance(app_client):
    data = _ok(app_client.get("/api/v1/token/balance"))
    assert data["KTRS"] == FIXTURE["balances"]["KTRS"]
    assert data["LVTN"] == FIXTURE["balances"]["LVTN"]


def test_token_events(app_client):
    data = _ok(app_client.get("/api/v1/token/events"))
    assert len(data) == len(FIXTURE["tokenEvents"])
    # Newest first
    assert data[0]["at"] >= data[-1]["at"]
