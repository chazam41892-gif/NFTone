import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createArtistSchema = z.object({
  userId: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens."),
  name: z.string().min(1).max(100),
  bio: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = createArtistSchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: body.userId } });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const profile = await prisma.artistProfile.create({
      data: body,
    });

    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create artist profile." },
      { status: 400 }
    );
  }
}
