"""Merge per-platform `latest.json` manifests into one unified manifest.

Tauri 2's `tauri build` emits a `latest.json` on every host, but only
populates the entry for the platform it just built. Combining four
matrix builds (windows-x86_64, darwin-x86_64, darwin-aarch64,
linux-x86_64) gives us four single-platform manifests; the desktop
updater wants one unified manifest with all four `platforms` entries.

This script is invoked from .github/workflows/desktop-release.yml after
the build matrix completes and all artifacts have been downloaded into
`dist/`. It writes `dist/latest.json` for upload to the GitHub Release.

Input  : dist/<artifact-name>/**/latest.json (one per platform)
Output : dist/latest.json (merged)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main(dist_dir: Path) -> int:
    manifests = list(dist_dir.rglob("latest.json"))
    if not manifests:
        print(f"no latest.json files under {dist_dir}", file=sys.stderr)
        return 1

    merged: dict = {
        "version": None,
        "notes": "",
        "pub_date": None,
        "platforms": {},
    }

    for path in manifests:
        if path == dist_dir / "latest.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"skipping malformed {path}: {exc}", file=sys.stderr)
            continue

        if merged["version"] is None:
            merged["version"] = data.get("version")
        elif data.get("version") and data["version"] != merged["version"]:
            print(
                f"WARNING: version mismatch across matrix: "
                f"{merged['version']} vs {data['version']} in {path}",
                file=sys.stderr,
            )

        if not merged["notes"] and data.get("notes"):
            merged["notes"] = data["notes"]
        if merged["pub_date"] is None and data.get("pub_date"):
            merged["pub_date"] = data["pub_date"]

        for platform, payload in (data.get("platforms") or {}).items():
            if not payload.get("signature") or not payload.get("url"):
                continue
            merged["platforms"][platform] = payload

    if not merged["version"]:
        print("merge failed: no version field across any manifest", file=sys.stderr)
        return 2

    if not merged["platforms"]:
        print("merge failed: no populated platform entries", file=sys.stderr)
        return 3

    out = dist_dir / "latest.json"
    out.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    print(f"merged {len(merged['platforms'])} platforms into {out}")
    print(json.dumps(merged, indent=2))
    return 0


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    raise SystemExit(main(target))
