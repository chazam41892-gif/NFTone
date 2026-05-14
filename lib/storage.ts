import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "nftones";

if (typeof window === "undefined" && (!supabaseUrl || !supabaseServiceKey)) {
  console.warn(
    "[storage] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Uploads will fail until set."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeExt(name: string, fallback: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext || ext.length > 6 || !/^[a-z0-9]+$/.test(ext)) return fallback;
  return ext;
}

export async function uploadAudio(file: File, userId: string): Promise<string> {
  const ext = safeExt(file.name, "mp3");
  const path = `audio/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`Audio upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCoverArt(file: File, userId: string): Promise<string> {
  const ext = safeExt(file.name, "jpg");
  const path = `covers/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`Cover art upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
