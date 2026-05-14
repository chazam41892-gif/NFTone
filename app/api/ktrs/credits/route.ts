import { NextRequest, NextResponse } from "next/server";
import { addKtrsCredits, getKtrsCredits, spendKtrsCredits } from "@/lib/ktrs";
import { z } from "zod";

const creditSchema = z.object({
  userId: z.string(),
  action: z.enum(["get", "add", "spend"]),
  amount: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = creditSchema.parse(await req.json());

    if (body.action === "get") {
      const balance = await getKtrsCredits(body.userId);
      return NextResponse.json({ balance });
    }

    if (body.action === "add") {
      if (!body.amount) throw new Error("Amount required.");
      const balance = await addKtrsCredits(body.userId, body.amount);
      return NextResponse.json({ balance });
    }

    if (body.action === "spend") {
      if (!body.amount) throw new Error("Amount required.");
      const balance = await spendKtrsCredits(body.userId, body.amount);
      return NextResponse.json({ balance });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "KTRS credit action failed." },
      { status: 400 }
    );
  }
}
