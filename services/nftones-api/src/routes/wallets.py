"""Wallet directory endpoint.

Additive extension to docs/04-api-events.md. The UI's access view shows wallet
labels alongside grants — this exposes the per-wallet metadata (label, tier,
verification, risk score) the host platform tracks.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..envelope import err, ok
from ..models import Wallet

router = APIRouter(prefix="/wallets", tags=["wallets"])


@router.get("")
def list_wallets(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(Wallet)).all()
    return ok([w.model_dump() for w in rows])


@router.get("/{wallet_id}")
def get_wallet(wallet_id: str, session: Session = Depends(get_session)):
    w = session.get(Wallet, wallet_id)
    if not w:
        return err("WALLET_NOT_FOUND", f"No wallet {wallet_id}", status=404)
    return ok(w.model_dump())
