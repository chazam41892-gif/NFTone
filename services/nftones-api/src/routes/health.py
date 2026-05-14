"""Health and version endpoints. Used by Docker healthcheck + ops dashboards."""
from __future__ import annotations

import os

from fastapi import APIRouter

from .. import __version__
from ..envelope import ok

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return ok({"status": "ok", "service": "nftones-api"})


@router.get("/version")
def version() -> dict:
    return ok({
        "version": __version__,
        "service": "nftones-api",
        "watermarker_url": os.environ.get("NFTONES_WATERMARKER_URL", ""),
        "auth_enabled": os.environ.get("NFTONES_AUTH_ENABLED", "false").lower() == "true",
    })
