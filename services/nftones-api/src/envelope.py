"""Response envelope per docs/04-api-events.md:

    { "ok": true,  "data": ..., "cost_ktrs": "0.00" }
    { "ok": false, "error": { "code": "...", "message": "..." } }

GET endpoints are free → cost_ktrs is "0.00". POSTs that spend tokens
override this in their handler.
"""
from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse


def ok(data: Any, cost_ktrs: str = "0.00") -> dict:
    return {"ok": True, "data": data, "cost_ktrs": cost_ktrs}


def err(code: str, message: str, status: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"ok": False, "error": {"code": code, "message": message}},
    )
