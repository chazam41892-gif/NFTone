import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export default async function ExplorePage() {
  const drops = await prisma.drop.findMany({
    where: { status: "PUBLISHED" },
    include: { artistProfile: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
          Marketplace
        </p>
        <h1 className="mt-3 text-4xl font-bold">Explore Drops</h1>
        <p className="mt-3 text-zinc-400">
          Discover new music. Support artists directly. Every collectible mints
          when you buy.
        </p>

        {drops.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-12 text-center">
            <p className="text-zinc-400">No drops yet. Check back soon.</p>
            <a
              href="/signin"
              className="mt-6 inline-block rounded-2xl bg-white px-6 py-3 font-bold text-black"
            >
              Are you an artist? Start your first drop.
            </a>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {drops.map((drop) => (
              <a
                key={drop.id}
                href={`/drop/${drop.id}`}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
              >
                {drop.coverArtUrl ? (
                  <img
                    src={drop.coverArtUrl}
                    alt={drop.title}
                    className="mb-3 aspect-square w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="mb-3 aspect-square w-full rounded-xl bg-gradient-to-br from-purple-900/40 to-zinc-900" />
                )}
                <h3 className="font-bold truncate">{drop.title}</h3>
                <p className="mt-1 text-sm text-zinc-400 truncate">
                  by {drop.artistProfile.name}
                </p>
                <p className="mt-2 text-sm text-purple-300">${drop.priceUsd}</p>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
