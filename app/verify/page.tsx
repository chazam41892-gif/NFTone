import type { Metadata } from "next";
import VerifyClient from "./VerifyClient";

export const metadata: Metadata = {
  title: "Verify watermark — NFTones",
  description:
    "Identify the buyer wallet behind a leaked NFTones audio file using the local offline watermarker.",
};

/**
 * Desktop-only feature. The webview is shared between browser and Tauri,
 * but the sidecar (`audio_watermarker` bundled with the desktop installer)
 * is only reachable on 127.0.0.1:8501 from inside the shell. The client
 * component below short-circuits to a "desktop required" notice on
 * non-Tauri runs.
 */
export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
          Provenance check
        </p>
        <h1 className="mt-3 text-3xl font-bold">Verify a leaked file</h1>
        <p className="mt-3 text-zinc-400">
          Drop an audio file into the local watermarker to identify which
          buyer wallet it came from. Everything stays on your machine — the
          file never leaves the desktop shell.
        </p>

        <div className="mt-10">
          <VerifyClient />
        </div>
      </div>
    </main>
  );
}
