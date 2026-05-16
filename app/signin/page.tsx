import AdaptiveSignIn from "@/components/AdaptiveSignIn";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 flex items-center justify-center">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
          Sign in
        </p>
        <h1 className="mt-3 text-3xl font-bold">Welcome to NFTones</h1>
        <p className="mt-3 text-zinc-400">
          Connect your Solana wallet, then sign a message to prove ownership. No
          password. No email required to start.
        </p>

        <div className="mt-8">
          <AdaptiveSignIn />
        </div>

        <p className="mt-8 text-xs text-zinc-500">
          By signing in, you confirm you have read and accept the platform&apos;s
          terms. Free to start. Mint when sold.
        </p>
      </section>
    </main>
  );
}
