"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Stage = "idle" | "uploading" | "creating";

export default function UploadDropForm() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");

  async function submitDrop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (status !== "authenticated") {
      setMessage("Sign in to create a drop.");
      return;
    }

    setLoading(true);
    setMessage("");
    setStage("uploading");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const audioFile = formData.get("audio") as File;
      const coverFile = formData.get("cover") as File | null;

      if (!audioFile || audioFile.size === 0) {
        throw new Error("Audio file required.");
      }

      const uploadFd = new FormData();
      uploadFd.append("audio", audioFile);
      if (coverFile && coverFile.size > 0) uploadFd.append("cover", coverFile);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: uploadFd,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed.");
      }

      const { audioUrl, coverUrl } = await uploadRes.json();

      setStage("creating");

      const payload = {
        title: String(formData.get("title")),
        description: String(formData.get("description") || ""),
        audioUrl,
        coverArtUrl: coverUrl || "",
        priceUsd: Number(formData.get("priceUsd")),
        mintMode: "LAZY",
        rights: {
          masterOwner: String(formData.get("masterOwner")),
          publishingOwner: String(formData.get("publishingOwner") || ""),
          commercialAllowed: formData.get("commercialAllowed") === "on",
          fanCollectibleOnly: formData.get("fanCollectibleOnly") === "on",
          exclusiveLicense: formData.get("exclusiveLicense") === "on",
          attestation: formData.get("attestation") === "on",
        },
      };

      const res = await fetch("/api/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.redirect) {
          router.push(data.redirect);
          return;
        }
        throw new Error(data.error || "Failed to create drop.");
      }

      setMessage("Drop created. Redirecting...");
      router.push(`/drop/${data.drop.id}`);
    } catch (err: any) {
      setMessage(err.message || "Failed to create drop.");
    } finally {
      setLoading(false);
      setStage("idle");
    }
  }

  if (status === "loading") {
    return <div className="text-zinc-400">Loading...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <p className="text-zinc-300">
          Sign in with your wallet to create a drop.
        </p>
        <a
          href="/signin"
          className="mt-4 inline-block rounded-2xl bg-white px-6 py-3 font-bold text-black"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitDrop}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4"
    >
      <input
        name="title"
        placeholder="Track title"
        className="w-full rounded-xl bg-black p-3"
        required
      />
      <textarea
        name="description"
        placeholder="Tell fans about this drop"
        className="w-full rounded-xl bg-black p-3"
      />

      <div>
        <label className="block text-sm text-zinc-400 mb-2">
          Audio file (MP3, WAV, FLAC, OGG, M4A — max 50MB)
        </label>
        <input
          name="audio"
          type="file"
          accept="audio/*"
          className="w-full text-zinc-300"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-2">
          Cover art (JPG, PNG, WebP, GIF — max 5MB, optional)
        </label>
        <input
          name="cover"
          type="file"
          accept="image/*"
          className="w-full text-zinc-300"
        />
      </div>

      <input
        name="priceUsd"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Price USD (e.g. 9.99)"
        className="w-full rounded-xl bg-black p-3"
        required
      />

      <div className="border-t border-white/10 pt-4">
        <h2 className="mb-3 text-xl font-bold">Rights Declaration</h2>

        <input
          name="masterOwner"
          placeholder="Master owner (your name or entity)"
          className="w-full rounded-xl bg-black p-3"
          required
        />
        <input
          name="publishingOwner"
          placeholder="Publishing owner (optional)"
          className="mt-3 w-full rounded-xl bg-black p-3"
        />

        <label className="mt-4 block text-sm">
          <input type="checkbox" name="commercialAllowed" /> Commercial use
          allowed
        </label>

        <label className="mt-2 block text-sm">
          <input type="checkbox" name="fanCollectibleOnly" defaultChecked /> Fan
          collectible only
        </label>

        <label className="mt-2 block text-sm">
          <input type="checkbox" name="exclusiveLicense" /> Exclusive license
          available
        </label>

        <div className="mt-6 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-sm text-zinc-300">
          <p className="font-semibold text-purple-200 mb-2">
            Required attestation
          </p>
          <label className="block">
            <input
              type="checkbox"
              name="attestation"
              required
              className="mr-2"
            />
            I confirm I own or have permission to monetize this audio. I
            understand NFTones provides timestamping, rights declarations, and
            royalty tools, but does not replace formal legal copyright
            registration. False claims may result in takedown.
          </label>
        </div>
      </div>

      <button
        disabled={loading}
        className="w-full rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50"
      >
        {stage === "uploading"
          ? "Uploading files..."
          : stage === "creating"
            ? "Creating drop..."
            : "Create Lazy Mint Drop"}
      </button>

      {message && (
        <p className="text-center text-sm text-purple-300">{message}</p>
      )}

      <p className="text-center text-xs text-zinc-500">
        Free to upload. Mint happens when a fan buys. Buyer covers the mint cost
        or it comes out of the sale.
      </p>
    </form>
  );
}
