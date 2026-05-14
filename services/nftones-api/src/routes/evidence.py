"""Evidence report endpoints (creator-private).

Phase 1: GET list + detail of pre-anchored evidence reports from the fixture.
Phase 6: POST /scans/:id/evidence triggers report generation, signing, and
anchor_evidence on Solana via the worker queue.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..envelope import err, ok
from ..models import Evidence

router = APIRouter(prefix="/evidence", tags=["evidence"])


@router.get("")
def list_evidence(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(Evidence).order_by(Evidence.generated_at.desc())).all()
    return ok([e.model_dump() for e in rows])


@router.get("/{evidence_id}")
def get_evidence(evidence_id: str, session: Session = Depends(get_session)):
    e = session.get(Evidence, evidence_id)
    if not e:
        return err("EVIDENCE_NOT_FOUND", f"No evidence {evidence_id}", status=404)
    return ok(e.model_dump())
