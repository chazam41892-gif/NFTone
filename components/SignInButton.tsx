"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { signIn, useSession } from "next-auth/react";
import bs58 from "bs58";
import { useState } from "react";

export default function SignInButton() {
  const { publicKey, signMessage, connected } = useWallet();
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    if (!publicKey || !signMessage) {
      setError("Connect a wallet first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const wallet = publicKey.toBase58();

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });

      if (!nonceRes.ok) {
        const err = await nonceRes.json();
        throw new Error(err.error || "Failed to get nonce.");
      }

      const { nonce, message } = await nonceRes.json();

      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      const result = await signIn("credentials", {
        wallet,
        signature,
        nonce,
        redirect: false,
      });

      if (result?.error) throw new Error("Signature verification failed.");
      if (result?.ok) {
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      setError(err.message || "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "authenticated") {
    return (
      <p className="text-sm text-zinc-400">
        Already signed in.{" "}
        <a href="/dashboard" className="text-purple-300 hover:text-purple-200">
          Go to dashboard →
        </a>
      </p>
    );
  }

  if (!connected) {
    return (
      <p className="text-sm text-zinc-500">
        Connect a wallet above, then sign a message to prove ownership.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={handleSignIn}
        disabled={loading}
        className="w-full rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50"
      >
        {loading ? "Signing..." : "Sign in with Wallet"}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
