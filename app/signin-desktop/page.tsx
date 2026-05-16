import SignInDesktopFlow from "./SignInDesktopFlow";

/**
 * The Tauri desktop shell can't host Phantom (it lives in the user's
 * browser extension). When the user clicks Sign-In in the desktop window,
 * Tauri opens the OS default browser to this page with a one-time `state`
 * token and a `callback` URL. This page does the normal Phantom flow,
 * then redirects to the callback (an nftones:// deep link) which the OS
 * routes back to the desktop app.
 *
 * Direct visits without those query params are bounced to /signin.
 */
export default function SignInDesktopPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 flex items-center justify-center">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
          Desktop sign-in
        </p>
        <h1 className="mt-3 text-3xl font-bold">Authorize NFTones desktop</h1>
        <p className="mt-3 text-zinc-400">
          We&apos;ll connect your wallet in this browser tab, then hand the
          signed proof back to the desktop app via a one-time link.
        </p>

        <div className="mt-8">
          <SignInDesktopFlow />
        </div>
      </section>
    </main>
  );
}
