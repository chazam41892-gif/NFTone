"use client";

import { useState, useEffect } from "react";

type PurchaseStatus = "PAID" | "WATERMARKED" | "MINTED" | "FAILED" | "PENDING";

export default function PurchaseDropForm({
  dropId,
  priceUsd,
  priceKtrs,
}: {
  dropId: string;
  priceUsd: number;
  priceKtrs: number;
}) {
  const [buyerWallet, setBuyerWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const [message, setMessage] = useState("");
  const [txSignature, setTxSignature] = useState("");
  const [nftAddress, setNftAddress] = useState("");
  const [watermarkedUrl, setWatermarkedUrl] = useState("");
  const [purchaseId, setPurchaseId] = useState("");

  useEffect(() => {
    if (!loading || !purchaseId) return;

    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/purchases/${purchaseId}`);
        if (!res.ok) return;

        const data = await res.json();
        setStatus(data.status);

        if (data.status === "MINTED") {
          setTxSignature(data.txSignature || "");
          setNftAddress(data.mintedNftAddress || "");
          setWatermarkedUrl(data.watermarkedAudioUrl || "");
          setLoading(false);
          setMessage("Successfully Minted!");
        } else if (data.status === "WATERMARKED") {
          setMessage("Audio file watermarked! Now minting NFT on Solana...");
        } else if (data.status === "FAILED") {
          setLoading(false);
          setStatus("FAILED");
          setMessage(`Purchase processing failed: ${data.failureReason || "Unknown error"}`);
        } else {
          setMessage("Deducting $KTRS credits and initializing watermarking...");
        }
      } catch (err) {
        console.error("Error polling status:", err);
      }
    };

    intervalId = setInterval(checkStatus, 2000);
    return () => clearInterval(intervalId);
  }, [loading, purchaseId]);

  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!buyerWallet) return;

    setLoading(true);
    setStatus("PENDING");
    setMessage("Submitting transaction request...");
    setTxSignature("");
    setNftAddress("");

    try {
      const fd = new FormData();
      fd.append("buyerWallet", buyerWallet);

      const res = await fetch(`/api/drops/${dropId}/purchase`, {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Purchase failed.");
      }

      setPurchaseId(data.purchase.id);
      setStatus(data.purchase.status);
      setMessage("Deducting $KTRS credits and initializing watermarking...");
    } catch (err: any) {
      setLoading(false);
      setStatus("FAILED");
      setMessage(err.message || "Purchase failed.");
    }
  }

  if (status === "MINTED") {
    return (
      <div className="rounded-3xl border border-green-500/30 bg-green-500/5 p-6 text-center space-y-4">
        <h2 className="text-2xl font-bold text-green-400">🎉 Purchase Succeeded!</h2>
        <p className="text-zinc-300">
          Your soundtrack has been watermarked with your wallet fingerprint and successfully minted as a Solana NFT!
        </p>

        <div className="text-left bg-black/40 p-4 rounded-xl space-y-2 text-sm">
          <p>
            <span className="font-semibold text-zinc-400">Minted NFT:</span>{" "}
            <a
              href={`https://explorer.solana.com/address/${nftAddress}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 underline break-all"
            >
              {nftAddress}
            </a>
          </p>
          <p>
            <span className="font-semibold text-zinc-400">Transaction:</span>{" "}
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 underline break-all"
            >
              {txSignature}
            </a>
          </p>
          {watermarkedUrl && (
            <p>
              <span className="font-semibold text-zinc-400">Watermarked File:</span>{" "}
              <a
                href={watermarkedUrl}
                download
                className="text-purple-400 underline break-all"
              >
                Download Protected Master
              </a>
            </p>
          )}
        </div>

        <button
          onClick={() => {
            setStatus(null);
            setBuyerWallet("");
            setMessage("");
          }}
          className="rounded-2xl bg-white px-6 py-3 font-bold text-black"
        >
          Buy Another Copy
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handlePurchase} className="mt-6 space-y-4">
      <div>
        <label className="block text-sm text-zinc-400 mb-2">
          Your Solana Wallet Address (buyer)
        </label>
        <input
          name="buyerWallet"
          value={buyerWallet}
          onChange={(e) => setBuyerWallet(e.target.value)}
          placeholder="e.g. 7npAi6kN1y3p..."
          className="w-full rounded-xl bg-black p-3 border border-white/10 focus:border-purple-500/50 outline-none"
          required
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-2xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50 flex items-center justify-center gap-3"
      >
        {loading && (
          <svg className="animate-spin h-5 w-5 text-black" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {loading ? "Processing..." : `Buy for $${priceUsd} (${priceKtrs} $KTRS)`}
      </button>

      {message && (
        <div className={`p-4 rounded-xl text-center text-sm font-medium ${
          status === "FAILED"
            ? "border border-red-500/30 bg-red-500/5 text-red-300"
            : "border border-purple-500/30 bg-purple-500/5 text-purple-300"
        }`}>
          {message}
        </div>
      )}
    </form>
  );
}
