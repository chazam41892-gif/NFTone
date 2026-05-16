"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { useEffect, useMemo, useState } from "react";

type Phase =
  | "missing-params"
  | "awaiting-wallet"
  | "ready"
  | "signing"
  | "redirecting"
  | "done"
  | "error";

/**
 * Implements the desktop sign-in handoff:
 *
 *   1. Read `state` + `callback` from query string. Reject the visit if
 *      either is missing — direct browser hits to /signin-desktop have
 *      no business here.
 *   2. Wait for the user to connect Phantom (or any installed Solana
 *      wallet adapter).
 *   3. Request a fresh nonce from /api/auth/nonce.
 *   4. Ask the wallet to signMessage("Sign in to NFTones — nonce: ...").
 *   5. Build `<callback>?state=...&wallet=...&signature=...&nonce=...` and
 *      navigate to it. The browser hands the URL to the OS, which routes
 *      `nftones://` schemes to the registered desktop app. Tauri's deep-link
 *      handler then emits the URL into the webview where the NextAuth
 *      credentials sign-in completes.
 *   6. Show a "you can close this tab" hint, since the browser is left at
 *      a dangling page after the protocol handoff.
 */
export default function SignInDesktopFlow() {
  const { publicKey, signMessage, connected, wallet } = useWallet();

  const [params, setParams] = useState<{ state: string; callback: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("awaiting-wallet");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const state = url.searchParams.get("state");
    const callback = url.searchParams.get("callback");
    if (!state || !callback) {
      setPhase("missing-params");
      return;
    }
    if (!callback.startsWith("nftones://")) {
      setPhase("error");
      setError("Refusing to redirect to a non-nftones:// callback.");
      return;
    }
    setParams({ state, callback });
  }, []);

  useEffect(() => {
    if (phase === "missing-params" || phase === "error") return;
    if (connected && publicKey && signMessage) {
      setPhase("ready");
    } else {
      setPhase("awaiting-wallet");
    }
  }, [phase, connected, publicKey, signMessage]);

  const walletAddress = useMemo(() => publicKey?.toBase58() ?? "", [publicKey]);

  async function handleSignAndHandOff() {
    if (!params) return;
    if (!publicKey || !signMessage) {
      setError("Wallet adapter is missing signMessage.");
      setPhase("error");
      return;
    }

    setPhase("signing");
    setError("");

    try {
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      });
      if (!nonceRes.ok) {
        const body = await nonceRes.json().catch(() => ({}));
        throw new Error(body.error || `Nonce request failed (${nonceRes.status}).`);
      }
      const { nonce, message } = await nonceRes.json();

      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      const callbackUrl = new URL(params.callback);
      callbackUrl.searchParams.set("state", params.state);
      callbackUrl.searchParams.set("wallet", walletAddress);
      callbackUrl.searchParams.set("signature", signature);
      callbackUrl.searchParams.set("nonce", nonce);

      setPhase("redirecting");
      window.location.href = callbackUrl.toString();

      // The OS protocol handler takes a moment to fire and the browser tab
      // is left dangling. Show the "you can close this tab" hint after a
      // short pause so it sticks even if the navigation succeeds.
      setTimeout(() => setPhase("done"), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown sign-in error.";
      setError(message);
      setPhase("error");
    }
  }

  if (phase === "missing-params") {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-red-300 font-semibold">
          This page is only used by the NFTones desktop app.
        </p>
        <p className="text-sm text-zinc-400">
          If you got here by accident, head to{" "}
          <a href="/signin" className="text-purple-300 underline hover:text-purple-200">
            /signin
          </a>{" "}
          for the regular web sign-in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Step 1 &mdash; Connect a wallet
        </p>
        <WalletMultiButton />
        {wallet && (
          <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
            Selected adapter: {wallet.adapter.name}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
          Step 2 &mdash; Sign &amp; return to desktop
        </p>
        <button
          type="button"
          onClick={handleSignAndHandOff}
          disabled={phase !== "ready"}
          aria-label="Sign and return to the NFTones desktop app"
          className="w-full rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
        >
          {phase === "awaiting-wallet" && "Connect a wallet to continue"}
          {phase === "ready" && "Sign in & hand back to desktop"}
          {phase === "signing" && "Waiting for wallet signature..."}
          {phase === "redirecting" && "Handing off to desktop..."}
          {phase === "done" && "Done — return to the desktop app"}
          {phase === "error" && "Try again"}
        </button>
      </div>

      {phase === "done" && (
        <p className="text-sm text-emerald-300" role="status">
          You can close this tab now. The desktop app should already be signed
          in.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-zinc-500 border-t border-white/5 pt-4">
        State token from desktop:{" "}
        <code className="font-mono text-zinc-400">
          {params?.state ? `${params.state.slice(0, 8)}…` : "—"}
        </code>
      </p>
    </div>
  );
}
