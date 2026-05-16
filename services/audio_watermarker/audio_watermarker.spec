# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the NFTones desktop audio_watermarker sidecar.

Build via the wrapper script (recommended):

    python build_sidecar.py

or directly:

    pyinstaller audio_watermarker.spec --clean

Output: dist/audio_watermarker(.exe) — single executable, no Python
runtime required on the user's machine.

Honest scope notes:
  - WAV-only. pydub is intentionally NOT in `hiddenimports` because it
    needs ffmpeg at runtime, which we don't bundle. The api.py guards
    pydub with try/except so mp3/m4a/flac uploads return HTTP 415
    instead of a 500. Adding ffmpeg bundling is a separate change.
  - Bundling scipy fully would double the binary size. We collect the
    submodules api.py actually touches (scipy.signal, scipy.fft) and
    let pyinstaller drop the rest.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

# numpy + soundfile must come with their data files (numpy.core uses
# generated .pyi/.so glue, soundfile ships libsndfile binaries).
numpy_datas, numpy_binaries, numpy_hidden = collect_all("numpy")
sf_datas, sf_binaries, sf_hidden = collect_all("soundfile")

# scipy: only collect what watermarker.py touches.
scipy_hidden = (
    collect_submodules("scipy.signal")
    + collect_submodules("scipy.fft")
    + collect_submodules("scipy.fftpack")
)

# uvicorn workers won't import unless we name them explicitly.
uvicorn_hidden = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
]

hiddenimports = numpy_hidden + sf_hidden + scipy_hidden + uvicorn_hidden + [
    "src",
    "src.api",
    "src.crypto",
    "src.storage",
    "src.watermarker",
    "fastapi",
    "starlette",
    "anyio",
    "h11",
    "httptools",
    "multipart",
    "python_multipart",
]

datas = numpy_datas + sf_datas
binaries = numpy_binaries + sf_binaries

a = Analysis(
    ["api_runner.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Trim weight — the desktop sidecar doesn't need plotting, GUI,
        # or testing frameworks.
        "matplotlib",
        "PIL",
        "PIL.Image",
        "tkinter",
        "pytest",
        "IPython",
        "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="audio_watermarker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX trips Windows SmartScreen and AV scanners
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Tauri pipes stdout/stderr through CommandEvent
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
