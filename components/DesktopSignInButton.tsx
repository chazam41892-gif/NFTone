"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { auth as desktopAuth, app } from "@/lib/desktop";
import { DESKTOP_SIGNIN_STATE_KEY } from "./DesktopDeepLinkHandler";

/**
 * Desktop variant of the sign-in button. Phantom (and every other Solana
 * wallet) lives in the user's browser extension and cannot be reached
 * from inside the Tauri webview, so we round-trip through the OS browser:
 *
 *   1. Ask the Rust side to mint a `state` token and open the system
 *      browser to /signin-desktop?state=...&callback=nftones://auth/callback
 *   2. Store `state` in sessionStorage so the deep-link receiver can
 *      validate the callback when the OS routes it back.
 *   3. Show a "waiting for browser" state until the deep-link handler
 *      flips this session to authenticated.
 *
 * The browser pages handles the Phantom signMessage flow; this component
 * never touches the wallet directly.
 */
export default function DesktopSignInButton({
  signinUrl = "https://nftones.app/signin-desktop",
}: {
  signinUrl?: string;
}) {
  const { status } = useSession();
  const [phase, setPhase] = useState<
    "idle" | "opening" | "waiting" | "error"
  >("idle");
  const [error, setError] = useState("");

  async function handleClick() {
    setPhase("opening");
    setError("");
    try {
      const { state } = await desktopAuth.requestWalletSignin(signinUrl);
      sessionStorage.setItem(DESKTOP_SIGNIN_STATE_KEY, state);
      setPhase("waiting");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to open browser.";
      setError(message);
      setPhase("error");
    }
  }

  async function handleOpenAgain() {
    // Fallback if the user lost the browser tab.
    await app.openExternal(signinUrl).catch(() => {});
  }

  if (status === "authenticated") {
    return (
      <p className="text-sm text-zinc-400">
        Signed in.{" "}
        <a href="/dashboard" className="text-purple-300 hover:text-purple-200">
          Go to dashboard &rarr;
        </a>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={phase === "opening" || phase === "waiting"}
        aria-label="Sign in via the system browser"
        className="w-full rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
      >
        {phase === "idle" && "Sign in with Wallet (opens browser)"}
        {phase === "opening" && "Opening browser..."}
        {phase === "waiting" && "Waiting for browser sign-in..."}
        {phase === "error" && "Retry"}
      </button>

      {phase === "waiting" && (
        <div className="space-y-2 text-sm text-zinc-400" role="status" aria-live="polite">
          <p>
            Complete sign-in in the browser tab. We&apos;ll automatically pick
            up the result when you finish.
          </p>
          <button
            type="button"
            onClick={handleOpenAgain}
            className="text-purple-300 underline hover:text-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
          >
            Re-open the browser tab
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-zinc-500">
        Phantom and other Solana wallets live in your browser, so desktop
        sign-in does a one-time browser round-trip. Subsequent launches are
        handled by your OS keychain.
      </p>
    </div>
  );
}
