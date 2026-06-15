import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity, generateSigner, percentAmount, publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import bs58 from "bs58";
import { uploadNftMetadata } from "./storage";

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

export async function mintNftOnPurchase(
  input: LazyMintInput
): Promise<MintResult> {
  try {
    new PublicKey(input.artistWallet);
    new PublicKey(input.buyerWallet);
  } catch (e: any) {
    return { status: "failed", error: `Invalid wallet: ${e?.message ?? e}` };
  }

  try {
    let secret: Uint8Array;

    if (process.env.PLATFORM_KEYPAIR_BASE58) {
      secret = bs58.decode(process.env.PLATFORM_KEYPAIR_BASE58);
    } else {
      if (rpcUrl.includes("mainnet") || rpcUrl.includes("api.mainnet-beta.solana.com")) {
        return {
          status: "failed",
          error: "PLATFORM_KEYPAIR_BASE58 is required for Solana mainnet transactions.",
        };
      }
      console.log("No PLATFORM_KEYPAIR_BASE58 found in env. Generating ephemeral keypair for devnet mint...");
      const ephemeralKeypair = Keypair.generate();
      secret = ephemeralKeypair.secretKey;

      let airdropSignature = "";
      let airdropSuccess = false;
      let lastAirdropError: any = null;

      // Try requesting a smaller amount (0.05 SOL) and retry up to 3 times
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Requesting devnet SOL airdrop (0.05 SOL) to ephemeral wallet: ${ephemeralKeypair.publicKey.toBase58()} - Attempt ${attempt}/3...`);
          airdropSignature = await connection.requestAirdrop(
            ephemeralKeypair.publicKey,
            0.05 * 1e9 // 0.05 SOL is enough to mint
          );
          const latestBlockHash = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: airdropSignature,
          }, "confirmed");
          airdropSuccess = true;
          console.log("Airdrop confirmed.");
          break;
        } catch (err: any) {
          lastAirdropError = err;
          console.warn(`Airdrop attempt ${attempt} failed:`, err?.message ?? err);
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }

      if (!airdropSuccess) {
        return {
          status: "failed",
          error: `Airdrop failed for ephemeral keypair after 3 attempts: ${lastAirdropError?.message ?? lastAirdropError}`,
        };
      }
    }

    const umi = createUmi(rpcUrl).use(mplTokenMetadata());
    const platform = umi.eddsa.createKeypairFromSecretKey(secret);
    umi.use(keypairIdentity(platform));

    console.log("Uploading NFT metadata JSON to Supabase storage...");
    // Build metadata JSON and upload to Supabase
    const metadataUri = await uploadNftMetadata({
      name: input.title,
      description: input.description ?? "",
      image: input.coverArtUrl ?? "",
      animation_url: input.audioUrl,
      properties: {
        files: [
          {
            uri: input.audioUrl,
            type: input.audioUrl.endsWith(".mp4") || input.audioUrl.endsWith(".webm") || input.audioUrl.endsWith(".mov")
              ? "video/mp4"
              : "audio/mpeg"
          }
        ]
      },
    }, input.dropId, `mint-${Date.now()}`);

    console.log(`NFT metadata URI: ${metadataUri}`);
    console.log("Minting NFT on-chain via Metaplex...");

    const mint = generateSigner(umi);
    const buyer = new PublicKey(input.buyerWallet);

    const tx = await createNft(umi, {
      mint,
      name: input.title.slice(0, 32),
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      tokenOwner: umiPublicKey(buyer.toBase58()),
    }).sendAndConfirm(umi);

    const txSignature = bs58.encode(tx.signature);
    console.log(`NFT Minted! Address: ${mint.publicKey.toString()}, Tx: ${txSignature}`);

    return {
      status: "minted",
      mintedNftAddress: mint.publicKey.toString(),
      txSignature,
    };
  } catch (err: any) {
    console.error("Minting failed:", err);
    return {
      status: "failed",
      error: `Minting failed: ${err?.message ?? err}`,
    };
  }
}

