"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { auth as desktopAuth, isTauri } from "@/lib/desktop";

/**
 * Always-mounted listener inside the Tauri webview that completes the
 * desktop wallet sign-in round-trip.
 *
 * Flow recap (full picture lives in app/signin-desktop/SignInDesktopFlow.tsx
 * and desktop/src-tauri/src/commands.rs::request_wallet_signin):
 *
 *   1. Desktop "Sign in" button calls auth.requestWalletSignin and stores
 *      the returned `state` in sessionStorage under STATE_KEY.
 *   2. OS browser handles Phantom signMessage, then redirects to
 *      nftones://auth/callback?state=...&wallet=...&signature=...&nonce=...
 *   3. Tauri routes the URL back to the desktop, emits a `deep-link` event.
 *   4. This component receives the event, validates state matches what was
 *      stored, then calls NextAuth credentials sign-in inline.
 *
 * In the browser (non-Tauri) this is a no-op.
 */
const STATE_KEY = "nftones.desktop.signin.state";

export const DESKTOP_SIGNIN_STATE_KEY = STATE_KEY;

export default function DesktopDeepLinkHandler() {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "received" }
    | { kind: "verifying"; wallet: string }
    | { kind: "success"; wallet: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Guard against double-fires (the deep-link plugin can emit twice on
  // some platforms when both the initial-url and on-open-url paths trip).
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isTauri()) return;
    let unsub: (() => void) | undefined;

    (async () => {
      unsub = await desktopAuth.onDeepLink(async (urls) => {
        for (const raw of urls) {
          if (handledRef.current.has(raw)) continue;
          handledRef.current.add(raw);

          let parsed: URL;
          try {
            parsed = new URL(raw);
          } catch {
            setStatus({ kind: "error", message: `Malformed callback URL: ${raw}` });
            continue;
          }

          if (parsed.protocol !== "nftones:") continue;
          if (parsed.host !== "auth" || parsed.pathname !== "/callback") continue;

          setStatus({ kind: "received" });

          const state = parsed.searchParams.get("state");
          const wallet = parsed.searchParams.get("wallet");
          const signature = parsed.searchParams.get("signature");
          const nonce = parsed.searchParams.get("nonce");

          if (!state || !wallet || !signature || !nonce) {
            setStatus({
              kind: "error",
              message: "Callback URL is missing required fields.",
            });
            continue;
          }

          const expected = sessionStorage.getItem(STATE_KEY);
          if (!expected || expected !== state) {
            setStatus({
              kind: "error",
              message:
                "Sign-in state token did not match. The link may be stale or forged.",
            });
            continue;
          }
          sessionStorage.removeItem(STATE_KEY);

          setStatus({ kind: "verifying", wallet });
          const result = await signIn("credentials", {
            wallet,
            signature,
            nonce,
            redirect: false,
          });

          if (result?.error) {
            setStatus({
              kind: "error",
              message: result.error || "Credentials verification failed.",
            });
          } else if (result?.ok) {
            setStatus({ kind: "success", wallet });
          } else {
            setStatus({
              kind: "error",
              message: "Sign-in returned no result.",
            });
          }
        }
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  if (!isTauri() || status.kind === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-xs rounded-2xl border border-white/10 bg-zinc-900/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur"
    >
      {status.kind === "received" && (
        <p className="text-zinc-300">Sign-in returned from browser&hellip;</p>
      )}
      {status.kind === "verifying" && (
        <p className="text-zinc-300">
          Verifying {status.wallet.slice(0, 4)}&hellip;{status.wallet.slice(-4)}
        </p>
      )}
      {status.kind === "success" && (
        <p className="text-emerald-300">
          Signed in as {status.wallet.slice(0, 4)}&hellip;{status.wallet.slice(-4)}
        </p>
      )}
      {status.kind === "error" && (
        <p className="text-red-300" role="alert">
          {status.message}
        </p>
      )}
    </div>
  );
}
