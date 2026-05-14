"""Cross-release grants endpoint.

Additive extension to docs/04-api-events.md (which only specifies
/releases/:id/access). The UI's watermark-map and access views read grants
across every release the caller owns, so we expose a cross-release listing.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..db import get_session
from ..envelope import ok
from ..models import Grant

router = APIRouter(prefix="/grants", tags=["grants"])


@router.get("")
def list_grants(
    session: Session = Depends(get_session),
    release_id: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
) -> dict:
    stmt = select(Grant)
    if release_id and release_id != "all":
        stmt = stmt.where(Grant.release_id == release_id)
    if tier and tier != "all":
        stmt = stmt.where(Grant.tier == tier)
    if status and status != "all":
        stmt = stmt.where(Grant.status == status)
    stmt = stmt.order_by(Grant.minted_at)
    rows = session.exec(stmt).all()
    return ok([g.model_dump() for g in rows])
