import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintNftOnPurchase } from "@/lib/solanaMint";
import { embedWatermark, watermarkerHealth } from "@/lib/watermarker";
import { downloadAudio, uploadWatermarkedAudio } from "@/lib/storage";
import { spendKtrsCredits } from "@/lib/ktrs";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await req.formData();
    const buyerWallet = String(formData.get("buyerWallet") || "");
    if (!buyerWallet) {
      return NextResponse.json(
        { error: "Buyer wallet required." },
        { status: 400 }
      );
    }

    const drop = await prisma.drop.findUnique({
      where: { id: params.id },
      include: { artistProfile: { include: { user: true } } },
    });

    if (!drop) {
      return NextResponse.json({ error: "Drop not found." }, { status: 404 });
    }
    if (drop.status === "REMOVED" || drop.status === "FLAGGED") {
      return NextResponse.json(
        { error: "This drop is no longer available." },
        { status: 410 }
      );
    }
    if (!drop.artistProfile.user.wallet) {
      return NextResponse.json(
        { error: "Artist wallet is missing." },
        { status: 400 }
      );
    }

    // Edition Size Limit Check
    if (drop.editionSize) {
      const completedCount = await prisma.purchase.count({
        where: {
          dropId: drop.id,
          status: { in: ["PAID", "WATERMARKED", "MINTED", "DELIVERED"] },
        },
      });
      if (completedCount >= drop.editionSize) {
        return NextResponse.json(
          { error: "This drop is sold out.", code: "SOLD_OUT" },
          { status: 403 }
        );
      }
    }

    // Look up or auto-onboard user
    let user = await prisma.user.findUnique({
      where: { wallet: buyerWallet },
      include: { ktrsCredits: true }
    });

    if (!user) {
      // Auto-onboard with 100 promo credits for testing
      user = await prisma.user.create({
        data: {
          wallet: buyerWallet,
          ktrsCredits: {
            create: { balance: 100.0 }
          }
        },
        include: { ktrsCredits: true }
      });
    }

    const priceKtrs = drop.priceKtrs || (drop.priceUsd ? drop.priceUsd * 10 : 10);

    // Debit the user's credits
    try {
      await spendKtrsCredits(user.id, priceKtrs);
    } catch (err: any) {
      if (err.message && err.message.includes("Insufficient")) {
        return NextResponse.json(
          { error: `Insufficient $KTRS. Action requires ${priceKtrs} $KTRS.`, code: "INSUFFICIENT_KTRS" },
          { status: 402 } // 402 Payment Required
        );
      }
      throw err;
    }

    // Immediately create the purchase record with status PAID
    const purchase = await prisma.purchase.create({
      data: {
        dropId: drop.id,
        buyerWallet,
        amountUsd: drop.priceUsd,
        amountKtrs: priceKtrs,
        status: "PAID",
      },
    });

    // Run the watermarking and Metaplex minting asynchronously in the background
    (async () => {
      try {
        let watermarkResult: any = null;
        let watermarkedUrl: string | null = null;

        const wmAlive = await watermarkerHealth();
        if (!wmAlive) {
          throw new Error("Watermarker service not reachable.");
        }

        const src = await downloadAudio(drop.audioUrl);
        watermarkResult = await embedWatermark(
          src.buffer,
          src.filename,
          src.contentType,
          drop.id,
          buyerWallet
        );
        watermarkedUrl = await uploadWatermarkedAudio(
          watermarkResult.watermarkedAudio,
          watermarkResult.contentType,
          drop.id,
          purchase.id
        );

        await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            status: "WATERMARKED",
            derivativeSha256: watermarkResult.derivativeSha256,
            watermarkedAudioUrl: watermarkedUrl,
            walletFingerprint: watermarkResult.walletFingerprint,
          },
        });

        if (!drop.masterSha256 && watermarkResult.masterSha256) {
          await prisma.drop.update({
            where: { id: drop.id },
            data: { masterSha256: watermarkResult.masterSha256 },
          });
        }

        // Mint the NFT on Solana devnet/mainnet
        const mintResult = await mintNftOnPurchase({
          dropId: drop.id,
          title: drop.title,
          description: drop.description || undefined,
          audioUrl: watermarkedUrl || drop.audioUrl,
          coverArtUrl: drop.coverArtUrl || undefined,
          artistWallet: drop.artistProfile.user.wallet as string,
          buyerWallet,
        });

        if (mintResult.status === "minted") {
          await prisma.purchase.update({
            where: { id: purchase.id },
            data: {
              status: "MINTED",
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
        } else if (mintResult.status === "failed") {
          throw new Error(`Minting failed: ${mintResult.error}`);
        } else {
          // Status pending / other lazy-mint options
          await prisma.drop.update({
            where: { id: drop.id },
            data: { status: "SOLD" },
          });
        }
      } catch (bgErr: any) {
        console.error(`Background watermarking/minting failed for purchase ${purchase.id}:`, bgErr);
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            status: "FAILED",
            failureReason: bgErr?.message ?? String(bgErr),
          },
        });
      }
    })();

    // Instantly return a success status to the buyer within <200ms
    return NextResponse.json({
      success: true,
      purchase: {
        id: purchase.id,
        status: "PAID",
      },
      message: "Purchase initialized. Watermarking and on-chain minting are running in the background.",
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Purchase failed." },
      { status: 400 }
    );
  }
}
