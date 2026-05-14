import { prisma } from "./prisma";

export async function getKtrsCredits(userId: string) {
  const balance = await prisma.ktrsCreditBalance.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0 },
  });

  return balance.balance;
}

export async function addKtrsCredits(userId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  return prisma.ktrsCreditBalance.upsert({
    where: { userId },
    update: { balance: { increment: amount } },
    create: { userId, balance: amount },
  });
}

export async function spendKtrsCredits(userId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive.");

  const current = await getKtrsCredits(userId);

  if (current < amount) {
    throw new Error("Insufficient $KTRS credits.");
  }

  return prisma.ktrsCreditBalance.update({
    where: { userId },
    data: { balance: { decrement: amount } },
  });
}
