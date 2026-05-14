import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadAudio, uploadCoverArt } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_MB = 50;
const MAX_COVER_MB = 5;

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = (session.user as any).id;

  /*
    NOTE on Vercel deploys: serverless functions cap request bodies at 4.5MB.
    For 50MB audio uploads in production, switch to direct browser-to-Supabase
    uploads using a signed URL flow — keep this server-side route for dev only,
    or self-host on a box that allows larger bodies.
  */

  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const cover = formData.get("cover") as File | null;

    const result: { audioUrl?: string; coverUrl?: string } = {};

    if (audio && audio.size > 0) {
      if (!AUDIO_TYPES.includes(audio.type)) {
        return NextResponse.json(
          { error: `Unsupported audio format: ${audio.type}` },
          { status: 400 }
        );
      }
      if (audio.size > MAX_AUDIO_MB * 1024 * 1024) {
        return NextResponse.json(
          { error: `Audio too large (max ${MAX_AUDIO_MB}MB).` },
          { status: 400 }
        );
      }
      result.audioUrl = await uploadAudio(audio, userId);
    }

    if (cover && cover.size > 0) {
      if (!IMAGE_TYPES.includes(cover.type)) {
        return NextResponse.json(
          { error: `Unsupported image format: ${cover.type}` },
          { status: 400 }
        );
      }
      if (cover.size > MAX_COVER_MB * 1024 * 1024) {
        return NextResponse.json(
          { error: `Cover too large (max ${MAX_COVER_MB}MB).` },
          { status: 400 }
        );
      }
      result.coverUrl = await uploadCoverArt(cover, userId);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Upload failed." },
      { status: 500 }
    );
  }
}
