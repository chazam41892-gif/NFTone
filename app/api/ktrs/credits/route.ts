import { NextRequest, NextResponse } from "next/server";
import { addKtrsCredits, getKtrsCredits, spendKtrsCredits } from "@/lib/ktrs";
import { auth } from "@/lib/auth";
import { z } from "zod";

const creditSchema = z.object({
  action: z.enum(["get", "add", "spend"]),
  amount: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const userId = (session.user as any).id;

  try {
    const body = creditSchema.parse(await req.json());

    if (body.action === "get") {
      const balance = await getKtrsCredits(userId);
      return NextResponse.json({ balance });
    }

    if (body.action === "spend") {
      if (!body.amount) {
        return NextResponse.json(
          { error: "Amount required." },
          { status: 400 }
        );
      }
      const balance = await spendKtrsCredits(userId, body.amount);
      return NextResponse.json({ balance: balance.balance });
    }

    if (body.action === "add") {
      /*
        Adding credits server-side is privileged: it represents either a
        signed-up purchase (Stripe webhook), a promo grant (admin), or a
        $KTRS-on-chain deposit (verified tx).
        Refuse direct user calls — they should never be able to mint
        themselves credits. Routes that grant credits live behind their
        own auth (Stripe webhook signature, admin role, on-chain proof).
      */
      return NextResponse.json(
        {
          error:
            "Direct credit grants are disabled. Credits are issued by Stripe webhooks, admin grants, or verified on-chain deposits.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "KTRS credit action failed." },
      { status: 400 }
    );
  }
}
