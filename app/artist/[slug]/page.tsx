import { prisma } from "@/lib/prisma";

export default async function ArtistPage({
  params,
}: {
  params: { slug: string };
}) {
  const profile = await prisma.artistProfile.findUnique({
    where: { slug: params.slug },
    include: {
      drops: {
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!profile) {
    return (
      <main className="min-h-screen bg-black text-white p-10">
        Artist not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <section className="mx-auto max-w-4xl">
        <div className="flex items-center gap-6">
          {profile.imageUrl && (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <div>
            <h1 className="text-4xl font-bold">{profile.name}</h1>
            {profile.verified && (
              <p className="mt-1 text-sm text-purple-300">Verified Artist</p>
            )}
          </div>
        </div>

        {profile.bio && (
          <p className="mt-6 max-w-2xl text-zinc-400">{profile.bio}</p>
        )}

        <h2 className="mt-12 text-2xl font-bold">Drops</h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {profile.drops.map((drop) => (
            <a
              key={drop.id}
              href={`/drop/${drop.id}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
            >
              {drop.coverArtUrl && (
                <img
                  src={drop.coverArtUrl}
                  alt={drop.title}
                  className="mb-3 aspect-square w-full rounded-xl object-cover"
                />
              )}
              <h3 className="font-bold">{drop.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">${drop.priceUsd}</p>
            </a>
          ))}

          {profile.drops.length === 0 && (
            <p className="text-zinc-500">No drops yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
