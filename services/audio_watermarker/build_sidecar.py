"""Build the desktop sidecar binary for the current host and drop it
into desktop/src-tauri/binaries/ with the target-triple naming Tauri
expects.

Usage (from this directory):

    # First time only:
    python -m venv .venv
    .venv/Scripts/activate   # Windows
    # or: source .venv/bin/activate   # macOS/Linux
    pip install -r requirements.txt
    pip install pyinstaller

    # Then:
    python build_sidecar.py

End result on Windows x64:
    desktop/src-tauri/binaries/audio_watermarker-x86_64-pc-windows-msvc.exe

Verifying:
    python build_sidecar.py --check-only

Why not Make? Cross-platform out of the box: this runs the same on
Windows/macOS/Linux developer machines.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def detect_target_triple() -> str:
    """Use rustc to discover the host's Tauri-compatible target triple.

    Falls back to a hard-coded best-guess if rustc isn't on PATH, but
    Tauri expects rustc to be installed anyway so this should always
    succeed in practice.
    """
    try:
        out = subprocess.check_output(
            ["rustc", "--version", "--verbose"], text=True
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(
            "rustc not on PATH. Install Rust (https://rustup.rs/) — the "
            "desktop shell needs it anyway."
        ) from exc

    for line in out.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()

    raise RuntimeError(
        "rustc --version --verbose did not contain a `host:` line; "
        f"output was:\n{out}"
    )


def run(cmd: list[str], cwd: Path) -> None:
    print(f"$ {' '.join(cmd)} (cwd={cwd})")
    subprocess.check_call(cmd, cwd=str(cwd))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Verify the expected output path without running pyinstaller.",
    )
    parser.add_argument(
        "--target",
        default=None,
        help="Override the target triple (default: detect via rustc).",
    )
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    repo_root = here.parent.parent
    spec = here / "audio_watermarker.spec"
    dist_dir = here / "dist"
    binaries_dir = repo_root / "desktop" / "src-tauri" / "binaries"

    target = args.target or detect_target_triple()
    binary_name = "audio_watermarker"
    ext = ".exe" if sys.platform.startswith("win") else ""
    final_name = f"{binary_name}-{target}{ext}"
    final_path = binaries_dir / final_name

    print(f"target triple : {target}")
    print(f"final binary  : {final_path}")

    if args.check_only:
        return 0

    if not spec.exists():
        print(f"ERROR: spec file missing at {spec}", file=sys.stderr)
        return 1

    binaries_dir.mkdir(parents=True, exist_ok=True)
    run(
        [sys.executable, "-m", "PyInstaller", str(spec), "--clean", "--noconfirm"],
        cwd=here,
    )

    built = dist_dir / f"{binary_name}{ext}"
    if not built.exists():
        print(f"ERROR: pyinstaller did not produce {built}", file=sys.stderr)
        return 2

    if final_path.exists():
        final_path.unlink()
    shutil.copy2(built, final_path)
    print(f"copied {built} -> {final_path}")

    # Reminder: also re-add externalBin to tauri.conf.json when shipping.
    print(
        "\nNext: add to desktop/src-tauri/tauri.conf.json under `bundle`:\n"
        '    "externalBin": ["binaries/audio_watermarker"]\n'
        "(left out of the default config so fresh-clone builds don't fail "
        "before this binary is produced.)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
