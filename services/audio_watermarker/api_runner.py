"""Entry point for the pyinstaller-frozen desktop sidecar.

Tauri spawns `binaries/audio_watermarker(-<target-triple>)` with
`--host 127.0.0.1 --port 8501` (see
`desktop/src-tauri/src/sidecar.rs::WATERMARKER_PORT`). This wrapper
parses those flags and runs the FastAPI app on the asyncio loop —
suitable for being a single-file binary, no shell.

Run directly for dev (without freezing):

    python -m services.audio_watermarker.api_runner --port 8501

When frozen by pyinstaller, `sys.frozen` is set; we behave identically
either way.
"""
from __future__ import annotations

import argparse
import logging
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="nftones-audio-watermarker",
        description="NFTones offline watermark embed/detect HTTP service.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8501)
    parser.add_argument(
        "--log-level",
        default="info",
        choices=["debug", "info", "warning", "error", "critical"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=args.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("watermarker.sidecar")
    log.info(
        "starting nftones-audio-watermarker on %s:%d (frozen=%s)",
        args.host,
        args.port,
        getattr(sys, "frozen", False),
    )

    # Import lazily so that --help works without paying the numpy/scipy
    # import cost.
    import uvicorn

    # `src.api:app` is the same FastAPI app used by the Dockerized server.
    # Importing it directly (rather than via a module string) ensures
    # pyinstaller traces the dependency.
    from src.api import app  # noqa: WPS433

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        access_log=False,  # quiet by default; Tauri pipes stdout/stderr
        loop="asyncio",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
