import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens."),
  name: z.string().min(1).max(100),
  bio: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = (session.user as any).id;

  try {
    const body = schema.parse(await req.json());

    const existingProfile = await prisma.artistProfile.findUnique({
      where: { userId },
    });
    if (existingProfile) {
      return NextResponse.json(
        { error: "You already have an artist profile.", profile: existingProfile },
        { status: 409 }
      );
    }

    const slugTaken = await prisma.artistProfile.findUnique({
      where: { slug: body.slug },
    });
    if (slugTaken) {
      return NextResponse.json(
        { error: "That handle is taken. Try another." },
        { status: 409 }
      );
    }

    const profile = await prisma.artistProfile.create({
      data: {
        userId,
        slug: body.slug,
        name: body.name,
        bio: body.bio,
      },
    });

    return NextResponse.json({ profile });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Onboarding failed." },
      { status: 400 }
    );
  }
}
