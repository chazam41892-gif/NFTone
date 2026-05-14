"""Leak-scan endpoints.

Phase 1: GET list + detail. Reads pre-canned demo scans from the fixture.
Phase 6: POST /scans proxies to audio_watermarker /detect; scan rows are
written from the worker's SCAN_DONE event.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..envelope import err, ok
from ..models import Scan

router = APIRouter(prefix="/scans", tags=["scans"])


@router.get("")
def list_scans(session: Session = Depends(get_session)) -> dict:
    rows = session.exec(select(Scan).order_by(Scan.uploaded_at.desc())).all()
    return ok([s.model_dump() for s in rows])


@router.get("/{scan_id}")
def get_scan(scan_id: str, session: Session = Depends(get_session)):
    s = session.get(Scan, scan_id)
    if not s:
        return err("SCAN_NOT_FOUND", f"No scan {scan_id}", status=404)
    return ok(s.model_dump())
