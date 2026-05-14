import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UploadDropForm from "@/components/UploadDropForm";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      artistProfile: true,
      drops: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!user) redirect("/signin");
  if (!user.artistProfile) redirect("/onboard");

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-10">
      <section className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Dashboard
            </p>
            <h1 className="mt-2 text-4xl font-bold">
              {user.artistProfile.name}
            </h1>
            <p className="mt-1 text-sm">
              <a
                href={`/artist/${user.artistProfile.slug}`}
                className="text-purple-300 hover:text-purple-200"
              >
                /artist/{user.artistProfile.slug}
              </a>
              {user.wallet && (
                <span className="ml-3 text-zinc-500">
                  {user.wallet.slice(0, 4)}...{user.wallet.slice(-4)}
                </span>
              )}
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4">Create a drop</h2>
          <UploadDropForm />
        </div>

        {user.drops.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-4">Your drops</h2>
            <div className="grid gap-3">
              {user.drops.map((drop) => (
                <a
                  key={drop.id}
                  href={`/drop/${drop.id}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <div>
                    <p className="font-bold">{drop.title}</p>
                    <p className="text-sm text-zinc-400">
                      ${drop.priceUsd} · {drop.status}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-500">{drop.mintMode}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
