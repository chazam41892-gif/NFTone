"use client";

import { useEffect, useState } from "react";
import {
  isTauri,
  dialog,
  watermarker,
  type DetectResult,
} from "@/lib/desktop";

type Phase =
  | "checking-runtime"
  | "browser"
  | "checking-sidecar"
  | "sidecar-down"
  | "idle"
  | "scanning"
  | "result"
  | "error";

export default function VerifyClient() {
  const [phase, setPhase] = useState<Phase>("checking-runtime");
  const [path, setPath] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isTauri()) {
      setPhase("browser");
      return;
    }
    setPhase("checking-sidecar");
    watermarker
      .health()
      .then((ok) => setPhase(ok ? "idle" : "sidecar-down"))
      .catch(() => setPhase("sidecar-down"));
  }, []);

  async function handlePick() {
    setError("");
    setResult(null);
    try {
      const picked = await dialog.pickAudioFile();
      if (!picked) return;
      setPath(picked);
      setPhase("scanning");
      const res = await watermarker.detect(picked);
      setResult(res);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed.");
      setPhase("error");
    }
  }

  if (phase === "checking-runtime" || phase === "checking-sidecar") {
    return <p className="text-zinc-400">Checking environment&hellip;</p>;
  }

  if (phase === "browser") {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6">
        <p className="font-semibold text-amber-200">Desktop app required</p>
        <p className="text-sm text-zinc-400">
          Watermark verification runs offline inside the NFTones desktop
          shell. It is not available in the browser. Install the desktop app
          to use this feature.
        </p>
      </div>
    );
  }

  if (phase === "sidecar-down") {
    return (
      <div className="space-y-3 rounded-2xl border border-red-400/20 bg-red-400/5 p-6">
        <p className="font-semibold text-red-200">
          Local watermarker not responding
        </p>
        <p className="text-sm text-zinc-400">
          The bundled <code>audio_watermarker</code> sidecar isn&apos;t
          reachable on 127.0.0.1:8501. Try restarting NFTones, or report
          this if it persists — there may be a port conflict.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={handlePick}
        disabled={phase === "scanning"}
        aria-label="Choose an audio file to scan for watermark"
        className="w-full rounded-2xl bg-white px-6 py-4 font-bold text-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
      >
        {phase === "scanning" ? "Scanning..." : "Choose an audio file"}
      </button>

      {path && (
        <p className="text-xs text-zinc-500 break-all">
          File: <code className="text-zinc-300">{path}</code>
        </p>
      )}

      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {result && <DetectionReport result={result} />}
    </div>
  );
}

function DetectionReport({ result }: { result: DetectResult }) {
  const matched = result.matched && result.wallet_id;
  const tone = matched
    ? "border-emerald-400/30 bg-emerald-400/5"
    : "border-zinc-500/30 bg-zinc-800/40";

  return (
    <section
      className={`space-y-4 rounded-2xl border p-6 ${tone}`}
      aria-live="polite"
      role="status"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          {matched ? "Match found" : "No buyer wallet identified"}
        </h2>
        <span className="text-xs uppercase tracking-wide text-zinc-400">
          Confidence: {result.confidence}
        </span>
      </header>

      {matched ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-zinc-500">Wallet</dt>
          <dd className="font-mono break-all">{result.wallet_id}</dd>
          <dt className="text-zinc-500">Fingerprint</dt>
          <dd className="font-mono">{result.wallet_fingerprint}</dd>
          <dt className="text-zinc-500">Correlation</dt>
          <dd>{result.correlation.toFixed(4)}</dd>
          <dt className="text-zinc-500">Threshold</dt>
          <dd>{result.threshold.toFixed(4)}</dd>
          <dt className="text-zinc-500">Wallets searched</dt>
          <dd>{result.wallets_searched.toLocaleString()}</dd>
        </dl>
      ) : (
        <p className="text-sm text-zinc-400">
          Searched {result.wallets_searched.toLocaleString()} known wallets.
          Best correlation was {result.correlation.toFixed(4)} (threshold{" "}
          {result.threshold.toFixed(4)}). The file either pre-dates NFTones,
          has been transcoded beyond the watermark&apos;s tolerance, or
          belongs to a release this device hasn&apos;t indexed yet.
        </p>
      )}
    </section>
  );
}
