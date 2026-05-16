"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isTauri, app } from "@/lib/desktop";

/**
 * Tiny pill rendered in the corner of every page when the webview is
 * running inside the Tauri shell. Doubles as a navigation tap-target into
 * /verify, the desktop-only watermark-detect surface.
 *
 * Deliberately a no-op in the browser — `isTauri()` short-circuits.
 */
export default function DesktopBadge() {
  const [version, setVersion] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isTauri()) return;
    app
      .version()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  if (!mounted || !isTauri()) return null;

  return (
    <Link
      href="/verify"
      aria-label={`Open watermark verification (NFTones desktop${
        version ? ` v${version}` : ""
      })`}
      className="fixed top-4 right-4 z-40 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 backdrop-blur hover:bg-emerald-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-emerald-300"
      />
      Desktop {version ? `v${version}` : ""}
    </Link>
  );
}
