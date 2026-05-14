import { prisma } from "@/lib/prisma";

export default async function DropPage({ params }: { params: { id: string } }) {
  const drop = await prisma.drop.findUnique({
    where: { id: params.id },
    include: {
      artistProfile: true,
      rights: true,
    },
  });

  if (!drop) {
    return (
      <main className="min-h-screen bg-black text-white p-10">
        Drop not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
        {drop.coverArtUrl && (
          <img
            src={drop.coverArtUrl}
            alt={drop.title}
            className="mb-6 aspect-square w-full rounded-3xl object-cover"
          />
        )}

        <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
          NFTones Drop
        </p>

        <h1 className="mt-3 text-4xl font-bold">{drop.title}</h1>

        <p className="mt-2 text-zinc-400">
          by {drop.artistProfile.name}
        </p>

        <p className="mt-6 text-zinc-300">{drop.description}</p>

        <audio controls className="mt-6 w-full">
          <source src={drop.audioUrl} />
        </audio>

        <div className="mt-6 rounded-2xl bg-black/40 p-4">
          <p>Price: ${drop.priceUsd}</p>
          <p>Mint mode: {drop.mintMode}</p>
          <p>Rights: {drop.rights?.fanCollectibleOnly ? "Fan collectible" : "License-enabled"}</p>
        </div>

        <form action={`/api/drops/${drop.id}/purchase`} method="POST" className="mt-6">
          <input
            name="buyerWallet"
            placeholder="Buyer Solana wallet"
            className="w-full rounded-xl bg-black p-3"
            required
          />

          <button className="mt-4 rounded-2xl bg-white px-6 py-3 font-bold text-black">
            Buy / Mint When Sold
          </button>
        </form>
      </section>
    </main>
  );
}
