import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSignedUploadUrlForPath, getPublicUrlForPath } from "@/lib/storage";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename");
    const contentType = searchParams.get("contentType");

    if (!filename) {
      return NextResponse.json({ error: "Filename required." }, { status: 400 });
    }

    const isImage = contentType?.startsWith("image/");
    const ext = filename.split(".").pop()?.toLowerCase() || (isImage ? "jpg" : "mp3");
    const prefix = isImage ? "covers" : "audio";
    const path = `${prefix}/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

    const { signedUrl, token } = await createSignedUploadUrlForPath(path);
    const publicUrl = getPublicUrlForPath(path);

    return NextResponse.json({
      signedUrl,
      token,
      path,
      publicUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate signed URL." },
      { status: 500 }
    );
  }
}
