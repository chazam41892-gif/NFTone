"""NFTones API — orchestrator service for the dashboard frontend.

This service owns releases, wallets, grants, scans, evidence, and token
events. It is the source of truth the frontend reads from in Phase 2+.

Architecture position:
    web (Cloudflare Pages / Tauri shell / Android TWA)
        ↓ HTTPS
    nftones-api (this service — Hetzner Docker)
        ↓ (Phase 6) HTTP
    audio_watermarker (separate service — Hetzner Docker)
        ↓ (Phase 7) RPC
    Solana program (Anchor — devnet first, mainnet after audit)

Auth: NONE in Phase 1 (read-only fixture passthrough). Phase 5 adds wallet
signature-derived JWT. Per Fortune-500 ISOLATE, that change is gated behind
NFTONES_AUTH_ENABLED so Phase 1 deploys are not blocked on auth work.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .routes import evidence, grants, health, releases, scans, token, wallets
from .seed import seed_if_empty

logging.basicConfig(
    level=os.environ.get("NFTONES_API_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("nftones_api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    counts = seed_if_empty()
    log.info("startup: seed counts %s", counts)
    yield
    log.info("shutdown: nftones-api %s", __version__)


app = FastAPI(
    title="NFTones API",
    version=__version__,
    description=(
        "Orchestrator for NFTones — audio provenance + leak attribution. "
        "Read-only Phase 1 surface; full event-model in docs/04-api-events.md."
    ),
    lifespan=lifespan,
)

# CORS — Cloudflare Pages frontend domain in prod; permissive in dev.
_allowed_origins = os.environ.get(
    "NFTONES_API_CORS_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000,tauri://localhost,https://tauri.localhost",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Versioned router mount — strangler-fig friendly. v2 mounts later without
# touching v1 callers.
from fastapi import APIRouter
_v1 = APIRouter(prefix="/api/v1")
_v1.include_router(health.router)
_v1.include_router(releases.router)
_v1.include_router(grants.router)
_v1.include_router(wallets.router)
_v1.include_router(scans.router)
_v1.include_router(evidence.router)
_v1.include_router(token.router)
app.include_router(_v1)
