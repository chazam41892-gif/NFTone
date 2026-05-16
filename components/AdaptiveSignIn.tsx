"use client";

import { useEffect, useState } from "react";
import { isTauri } from "@/lib/desktop";
import SignInButton from "./SignInButton";
import WalletButton from "./WalletButton";
import DesktopSignInButton from "./DesktopSignInButton";

/**
 * Renders the right sign-in flow for the runtime:
 *   - Browser   → existing WalletButton + SignInButton (wallet adapter)
 *   - Desktop   → DesktopSignInButton (OS-browser handoff)
 *
 * isTauri() is deferred to a useEffect so the SSR render matches the
 * initial client render — otherwise React would warn about a hydration
 * mismatch when the page is loaded inside the Tauri webview.
 */
export default function AdaptiveSignIn() {
  const [desktop, setDesktop] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDesktop(isTauri());
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <WalletButton />
        <SignInButton />
      </div>
    );
  }

  if (desktop) {
    return <DesktopSignInButton />;
  }

  return (
    <div className="space-y-4">
      <WalletButton />
      <SignInButton />
    </div>
  );
}
