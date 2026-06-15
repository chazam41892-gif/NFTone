import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const BUCKET = "nftones";

let _admin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

export async function uploadNftMetadata(
  jsonObj: any,
  dropId: string,
  purchaseId: string
): Promise<string> {
  const metadataPath = `metadata/${dropId}/${purchaseId}.json`;
  const buffer = Buffer.from(JSON.stringify(jsonObj, null, 2), "utf-8");

  try {
    const { error } = await getAdmin().storage
      .from(BUCKET)
      .upload(metadataPath, buffer, {
        contentType: "application/json",
        upsert: true,
      });

    if (!error) {
      const { data } = getAdmin().storage.from(BUCKET).getPublicUrl(metadataPath);
      return data.publicUrl;
    }
    console.warn("Supabase metadata upload error, falling back to local file:", error.message);
  } catch (err: any) {
    console.warn("Supabase metadata upload failed, falling back to local file:", err?.message ?? err);
  }

  // Local fallback: write to public/metadata/...
  try {
    const localDir = path.resolve(process.cwd(), "public", "metadata", dropId);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localFilePath = path.join(localDir, `${purchaseId}.json`);
    fs.writeFileSync(localFilePath, buffer);
    console.log(`Saved metadata locally to ${localFilePath}`);
    return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/metadata/${dropId}/${purchaseId}.json`;
  } catch (localErr: any) {
    console.error("Local metadata save failed:", localErr);
    return `https://dummy-metadata.nftonez.com/${dropId}/${purchaseId}.json`;
  }
}

export async function createSignedUploadUrlForPath(
  filePath: string
): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await getAdmin().storage
    .from(BUCKET)
    .createSignedUploadUrl(filePath);

  if (error) {
    throw new Error(`Failed to create signed upload URL: ${error.message}`);
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export function getPublicUrlForPath(filePath: string): string {
  const { data } = getAdmin().storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

