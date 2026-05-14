"use client";

import { useState } from "react";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function OnboardingWizard() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [bio, setBio] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const cleanedSlug = slugify(slug);
    if (cleanedSlug.length < 2) {
      setError("Pick a handle that's at least 2 characters.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: cleanedSlug, bio: bio || undefined }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create profile.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-5"
    >
      <div>
        <label className="block text-sm text-zinc-400 mb-2">Artist name</label>
        <input
          value={name}
          onChange={onNameChange}
          placeholder="Your stage name"
          className="w-full rounded-xl bg-black p-3"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-2">URL handle</label>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="your-handle"
          pattern="[a-z0-9-]+"
          className="w-full rounded-xl bg-black p-3"
          required
        />
        <p className="mt-1 text-xs text-zinc-500">
          Public profile URL: /artist/{slug || "your-handle"}
        </p>
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-2">
          Bio (optional)
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell fans who you are."
          rows={4}
          className="w-full rounded-xl bg-black p-3"
        />
      </div>

      <button
        disabled={loading}
        className="w-full rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create profile and continue"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
