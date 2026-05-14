import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mintNftOnPurchase } from "@/lib/solanaMint";
import { embedWatermark, watermarkerHealth } from "@/lib/watermarker";
import { downloadAudio, uploadWatermarkedAudio } from "@/lib/storage";

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

    /*
      PRODUCTION TODO — payment:
        1. Take payment first (Stripe / on-chain SOL / KTRS spend).
        2. Confirm the payment is final.
        3. Only then proceed with watermark + mint.
      For now, this route treats the request as already-paid. Gate it behind
      auth and a payment processor before going live.
    */

    const purchase = await prisma.purchase.create({
      data: {
        dropId: drop.id,
        buyerWallet,
        amountUsd: drop.priceUsd,
        status: "PAID",
      },
    });

    let watermarkResult: Awaited<ReturnType<typeof embedWatermark>> | null =
      null;
    let watermarkedUrl: string | null = null;
    let watermarkSkippedReason: string | null = null;

    const wmAlive = await watermarkerHealth();
    if (!wmAlive) {
      watermarkSkippedReason =
        "Watermarker service not reachable. Start it with `uvicorn src.api:app --port 8500` in services/audio_watermarker, or set NFTONES_WATERMARKER_URL.";
    } else {
      try {
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
      } catch (err: any) {
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            status: "FAILED",
            failureReason: `Watermark failed: ${err?.message ?? err}`,
          },
        });
        return NextResponse.json(
          { error: `Watermark failed: ${err?.message ?? err}` },
          { status: 502 }
        );
      }
    }

    const mintResult = await mintNftOnPurchase({
      dropId: drop.id,
      title: drop.title,
      description: drop.description || undefined,
      audioUrl: watermarkedUrl || drop.audioUrl,
      coverArtUrl: drop.coverArtUrl || undefined,
      artistWallet: drop.artistProfile.user.wallet,
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
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          status: "FAILED",
          failureReason: `Mint failed: ${mintResult.error}`,
        },
      });
      return NextResponse.json(
        {
          error: `Mint failed: ${mintResult.error}`,
          purchase: { id: purchase.id, status: "FAILED" },
        },
        { status: 502 }
      );
    } else {
      await prisma.drop.update({
        where: { id: drop.id },
        data: { status: "SOLD" },
      });
    }

    return NextResponse.json({
      purchase: {
        id: purchase.id,
        status:
          mintResult.status === "minted"
            ? "MINTED"
            : watermarkResult
              ? "WATERMARKED"
              : "PAID",
        watermarkedAudioUrl: watermarkedUrl,
        derivativeSha256: watermarkResult?.derivativeSha256 ?? null,
        walletFingerprint: watermarkResult?.walletFingerprint ?? null,
      },
      mint: mintResult,
      watermarkSkippedReason,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Purchase failed." },
      { status: 400 }
    );
  }
}
