import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const BUCKET = "nftones";

let _admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Storage unavailable: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

function safeExt(name: string, fallback: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext || ext.length > 6 || !/^[a-z0-9]+$/.test(ext)) return fallback;
  return ext;
}

export async function uploadAudio(file: File, userId: string): Promise<string> {
  const ext = safeExt(file.name, "mp3");
  const path = `audio/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await getAdmin().storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`Audio upload failed: ${error.message}`);

  const { data } = getAdmin().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCoverArt(file: File, userId: string): Promise<string> {
  const ext = safeExt(file.name, "jpg");
  const path = `covers/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await getAdmin().storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`Cover art upload failed: ${error.message}`);

  const { data } = getAdmin().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function downloadAudio(audioUrl: string): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
}> {
  const res = await fetch(audioUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch source audio: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "audio/wav";
  const urlPath = new URL(audioUrl).pathname;
  const filename = urlPath.split("/").pop() || "source.wav";
  return { buffer, contentType, filename };
}

export async function uploadWatermarkedAudio(
  buffer: Buffer,
  contentType: string,
  dropId: string,
  purchaseId: string
): Promise<string> {
  const extFromMime: Record<string, string> = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/flac": "flac",
  };
  const ext = extFromMime[contentType] || "wav";
  const path = `watermarked/${dropId}/${purchaseId}.${ext}`;

  const { error } = await getAdmin().storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) throw new Error(`Watermarked upload failed: ${error.message}`);

  const { data } = getAdmin().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
