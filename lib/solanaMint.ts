import { Connection, PublicKey } from "@solana/web3.js";

const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const connection = new Connection(rpcUrl, "confirmed");

export type LazyMintInput = {
  dropId: string;
  title: string;
  description?: string;
  audioUrl: string;
  coverArtUrl?: string;
  artistWallet: string;
  buyerWallet: string;
};

export type MintPending = {
  status: "pending";
  reason: string;
};

export type MintSucceeded = {
  status: "minted";
  mintedNftAddress: string;
  txSignature: string;
};

export type MintFailed = {
  status: "failed";
  error: string;
};

export type MintResult = MintPending | MintSucceeded | MintFailed;

function configured(): boolean {
  return Boolean(process.env.PLATFORM_KEYPAIR_BASE58);
}

/**
 * Mint an NFT for the buyer.
 *
 * Behavior is gated on configuration:
 *
 *  - If PLATFORM_KEYPAIR_BASE58 is not set, returns { status: "pending" }
 *    with a reason. The Purchase row is recorded with status WATERMARKED
 *    so a backfill job can mint later when the platform wallet is funded.
 *
 *  - If PLATFORM_KEYPAIR_BASE58 IS set, the real Metaplex mint runs.
 *    That code path requires `@metaplex-foundation/umi` and
 *    `@metaplex-foundation/mpl-token-metadata` to be installed. Install with:
 *
 *        npm i @metaplex-foundation/umi \
 *              @metaplex-foundation/umi-bundle-defaults \
 *              @metaplex-foundation/mpl-token-metadata
 *
 *    Then uncomment the implementation block below.
 *
 * Lazy-minting rationale (kept from v0): NFTones launches without paying
 * platform-subsidized mint fees. Buyers cover the mint cost on purchase
 * — or, with this gate, mint is deferred until the platform wallet is
 * funded enough to run the backfill.
 */
export async function mintNftOnPurchase(
  input: LazyMintInput
): Promise<MintResult> {
  try {
    new PublicKey(input.artistWallet);
    new PublicKey(input.buyerWallet);
  } catch (e: any) {
    return { status: "failed", error: `Invalid wallet: ${e?.message ?? e}` };
  }

  if (!configured()) {
    return {
      status: "pending",
      reason:
        "PLATFORM_KEYPAIR_BASE58 not set; on-chain mint deferred. Watermarked copy is delivered to the buyer; backfill mint when platform wallet is funded.",
    };
  }

  /*
    REAL MINT (gated by PLATFORM_KEYPAIR_BASE58):

    import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
    import { keypairIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi";
    import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
    import bs58 from "bs58";

    const umi = createUmi(rpcUrl).use(mplTokenMetadata());
    const secret = bs58.decode(process.env.PLATFORM_KEYPAIR_BASE58!);
    const platform = umi.eddsa.createKeypairFromSecretKey(secret);
    umi.use(keypairIdentity(platform));

    // Build metadata JSON and upload to Supabase (or any storage) — pinning
    // the on-chain metadata URI to that public URL. Keep this synchronous;
    // for high volume, queue it.
    const metadataUri = await pinJsonMetadata({
      name: input.title,
      description: input.description ?? "",
      image: input.coverArtUrl,
      animation_url: input.audioUrl,
      properties: { files: [{ uri: input.audioUrl, type: "audio/*" }] },
    });

    const mint = generateSigner(umi);
    const buyer = new PublicKey(input.buyerWallet);

    const tx = await createNft(umi, {
      mint,
      name: input.title.slice(0, 32),
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      tokenOwner: umi.eddsa.publicKey(buyer.toBytes()),
    }).sendAndConfirm(umi);

    return {
      status: "minted",
      mintedNftAddress: mint.publicKey.toString(),
      txSignature: bs58.encode(tx.signature),
    };
  */

  return {
    status: "pending",
    reason:
      "PLATFORM_KEYPAIR_BASE58 is set, but the Metaplex implementation is not yet wired. Install @metaplex-foundation/umi + mpl-token-metadata, then uncomment the REAL MINT block in lib/solanaMint.ts.",
  };
}
