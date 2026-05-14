"""Release endpoints.

Phase 1: GET-only (list, detail, per-release grants).
Phase 5+: POST /releases (register), POST /releases/:id/revoke — both gated
on wallet auth and $KTRS debit.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..envelope import err, ok
from ..models import Grant, Release

router = APIRouter(prefix="/releases", tags=["releases"])


@router.get("")
def list_releases(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(Release).order_by(Release.created_at.desc())).all()
    return ok([r.model_dump() for r in rows])


@router.get("/{release_id}")
def get_release(release_id: str, session: Session = Depends(get_session)):
    r = session.get(Release, release_id)
    if not r:
        return err("RELEASE_NOT_FOUND", f"No release {release_id}", status=404)
    return ok(r.model_dump())


@router.get("/{release_id}/access")
def list_release_grants(release_id: str, session: Session = Depends(get_session)):
    r = session.get(Release, release_id)
    if not r:
        return err("RELEASE_NOT_FOUND", f"No release {release_id}", status=404)
    grants = session.exec(
        select(Grant).where(Grant.release_id == release_id).order_by(Grant.minted_at)
    ).all()
    return ok([g.model_dump() for g in grants])
