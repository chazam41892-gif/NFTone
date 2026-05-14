import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import OnboardingWizard from "@/components/OnboardingWizard";

export default async function OnboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const userId = (session.user as any).id;
  const existing = await prisma.artistProfile.findUnique({
    where: { userId },
  });
  if (existing) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 flex items-start justify-center">
      <section className="w-full max-w-2xl">
        <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
          Welcome to NFTones
        </p>
        <h1 className="mt-3 text-4xl font-bold">Create your artist profile</h1>
        <p className="mt-3 text-zinc-400">
          One step. After this you can start uploading drops. Free to start.
          Mint when sold.
        </p>

        <div className="mt-8">
          <OnboardingWizard />
        </div>
      </section>
    </main>
  );
}
