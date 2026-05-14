import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canCreateDrop, requiresLazyMint } from "@/lib/tiers";
import { rightsDeclarationSchema } from "@/lib/rights";
import { MintMode } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";

const createDropSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  audioUrl: z.string().url(),
  coverArtUrl: z.string().url().optional().or(z.literal("")),
  priceUsd: z.number().positive(),
  mintMode: z.nativeEnum(MintMode).default("LAZY"),
  rights: rightsDeclarationSchema,
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    const parsed = createDropSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { drops: true, artistProfile: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!user.artistProfile) {
      return NextResponse.json(
        { error: "Create your artist profile first.", redirect: "/onboard" },
        { status: 403 }
      );
    }

    const activeDropCount = user.drops.filter(
      (drop) => drop.status === "DRAFT" || drop.status === "PUBLISHED"
    ).length;

    if (!canCreateDrop(user.tier, activeDropCount)) {
      return NextResponse.json(
        { error: "Your current tier has reached its active drop limit." },
        { status: 403 }
      );
    }

    if (requiresLazyMint(user.tier) && parsed.mintMode !== "LAZY") {
      return NextResponse.json(
        { error: "Free tier only supports lazy minting." },
        { status: 403 }
      );
    }

    const drop = await prisma.drop.create({
      data: {
        userId: user.id,
        artistProfileId: user.artistProfile.id,
        title: parsed.title,
        description: parsed.description,
        audioUrl: parsed.audioUrl,
        coverArtUrl: parsed.coverArtUrl || null,
        priceUsd: parsed.priceUsd,
        mintMode: parsed.mintMode,
        status: "PUBLISHED",
        rights: {
          create: parsed.rights,
        },
      },
      include: { rights: true },
    });

    return NextResponse.json({ drop });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create drop." },
      { status: 400 }
    );
  }
}
