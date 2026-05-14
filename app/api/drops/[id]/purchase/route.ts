import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintNftOnPurchase } from "@/lib/solanaMint";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await req.formData();
    const buyerWallet = String(formData.get("buyerWallet"));

    const drop = await prisma.drop.findUnique({
      where: { id: params.id },
      include: { artistProfile: { include: { user: true } } },
    });

    if (!drop) {
      return NextResponse.json({ error: "Drop not found." }, { status: 404 });
    }

    if (!drop.artistProfile.user.wallet) {
      return NextResponse.json(
        { error: "Artist wallet is missing." },
        { status: 400 }
      );
    }

    /*
      PRODUCTION TODO:
      1. Process payment first.
      2. Confirm payment.
      3. Deduct mint/network costs from buyer or sale proceeds.
      4. Then mint NFT.
    */

    const mintResult = await mintNftOnPurchase({
      dropId: drop.id,
      title: drop.title,
      description: drop.description || undefined,
      audioUrl: drop.audioUrl,
      coverArtUrl: drop.coverArtUrl || undefined,
      artistWallet: drop.artistProfile.user.wallet,
      buyerWallet,
    });

    const purchase = await prisma.purchase.create({
      data: {
        dropId: drop.id,
        buyerWallet,
        amountUsd: drop.priceUsd,
        txSignature: mintResult.txSignature,
        mintedNftAddress: mintResult.mintedNftAddress,
      },
    });

    await prisma.drop.update({
      where: { id: drop.id },
      data: {
        status: "MINTED",
        mintedNftAddress: mintResult.mintedNftAddress,
      },
    });

    return NextResponse.json({ purchase, mintResult });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Purchase failed." },
      { status: 400 }
    );
  }
}
