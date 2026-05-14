"use client";

import dynamic from "next/dynamic";

// WalletMultiButton accesses window APIs at module-load — must be client-only.
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function WalletButton() {
  return <WalletMultiButton />;
}
