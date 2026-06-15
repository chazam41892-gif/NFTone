export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16">
      <section className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm uppercase tracking-[0.35em] text-purple-300">
          Powered by $KTRS on Solana
        </p>


        <div className="flex items-center gap-4 mb-4">
          <img src="/logo.png" alt="NFTonez Logo" className="h-16 w-16 object-contain rounded-xl border border-purple-500/30" />
          <span className="text-xl font-bold tracking-[0.2em] text-purple-400 uppercase">NFTonez</span>
        </div>

        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
          NFTonez: Own the Sound.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-zinc-300">
          NFTones helps artists control their music rights, drops, royalties,
          fan access, and monetization. Free to start. Mint when sold.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="/dashboard"
            className="rounded-2xl bg-white px-6 py-3 font-semibold text-black"
          >
            Start as Artist
          </a>

          <a
            href="#mission"
            className="rounded-2xl border border-white/20 px-6 py-3 font-semibold text-white"
          >
            Learn More
          </a>
        </div>
      </section>

      <section id="mission" className="mx-auto mt-24 max-w-5xl grid gap-6 md:grid-cols-3">
        {[
          ["Own Your Masters", "Artists deserve control over their music and catalog."],
          ["Mint When Sold", "No upfront minting burden. Lazy minting protects artists and the platform."],
          ["Powered by $KTRS", "$KTRS unlocks creator tools, boosts, AI features, and platform credits."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-3 text-zinc-400">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
