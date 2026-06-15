import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: params.id },
      include: {
        drop: {
          select: {
            title: true,
            coverArtUrl: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: purchase.id,
      dropId: purchase.dropId,
      buyerWallet: purchase.buyerWallet,
      amountKtrs: purchase.amountKtrs,
      status: purchase.status,
      txSignature: purchase.txSignature,
      mintedNftAddress: purchase.mintedNftAddress,
      derivativeSha256: purchase.derivativeSha256,
      watermarkedAudioUrl: purchase.watermarkedAudioUrl,
      failureReason: purchase.failureReason,
      dropTitle: purchase.drop.title,
      coverArtUrl: purchase.drop.coverArtUrl,
      updatedAt: purchase.updatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch purchase status." },
      { status: 500 }
    );
  }
}
