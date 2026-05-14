"""$KTRS / $LVTN token endpoints.

Phase 1: Read-only — surfaces seeded balance + event history from the fixture
so the dashboard's Token Flow view has real data to render.

Phase 7+: balance is computed from on-chain Solana state via Helius RPC;
token events are streamed from the worker queue.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..envelope import ok
from ..models import Balance, TokenEvent

router = APIRouter(prefix="/token", tags=["token"])


@router.get("/balance")
def get_balance(session: Session = Depends(get_session)) -> dict:
    b = session.get(Balance, "self")
    if not b:
        return ok({"KTRS": "0.00", "LVTN": "0.00"})
    return ok({"KTRS": b.ktrs, "LVTN": b.lvtn})


@router.get("/events")
def list_token_events(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(TokenEvent).order_by(TokenEvent.at.desc())).all()
    return ok([
        {"kind": e.kind, "amount": e.amount, "token": e.token, "reason": e.reason, "at": e.at}
        for e in rows
    ])
