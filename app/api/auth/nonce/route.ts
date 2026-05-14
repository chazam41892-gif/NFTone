import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { PublicKey } from "@solana/web3.js";

const NONCE_TTL_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet || typeof wallet !== "string") {
      return NextResponse.json({ error: "Wallet address required." }, { status: 400 });
    }

    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json({ error: "Invalid Solana wallet." }, { status: 400 });
    }

    await prisma.walletNonce.deleteMany({
      where: { expires: { lt: new Date() } },
    });

    const nonce = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + NONCE_TTL_MS);

    await prisma.walletNonce.create({
      data: { wallet, nonce, expires },
    });

    return NextResponse.json({
      nonce,
      message: `Sign in to NFTones — nonce: ${nonce}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to issue nonce." },
      { status: 500 }
    );
  }
}
