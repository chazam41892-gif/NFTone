const { Keypair } = require("@solana/web3.js");
const bs58Module = require("bs58");
const bs58 = bs58Module.default || bs58Module;
const fs = require("fs");
const path = require("path");

function main() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const secretKeyBase58 = bs58.encode(keypair.secretKey);

  console.log("=========================================");
  console.log("Solana Keypair Generated Successfully!");
  console.log("Public Key (Wallet Address):", publicKey);
  console.log("=========================================");
  console.log("Writing secret key to .env file...");

  const envPath = path.resolve(__dirname, "..", ".env");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Check if PLATFORM_KEYPAIR_BASE58 already exists
  if (envContent.includes("PLATFORM_KEYPAIR_BASE58")) {
    console.warn("WARNING: PLATFORM_KEYPAIR_BASE58 is already defined in your .env file!");
    console.log("Saving the new keypair to .env.production instead...");
    const prodEnvPath = path.resolve(__dirname, "..", ".env.production");
    fs.appendFileSync(prodEnvPath, `\nPLATFORM_KEYPAIR_BASE58=${secretKeyBase58}\n`);
    console.log(`Saved successfully to .env.production. Public Key: ${publicKey}`);
  } else {
    fs.appendFileSync(envPath, `\n# Solana platform fee payer keypair for Metaplex minting\nPLATFORM_KEYPAIR_BASE58=${secretKeyBase58}\n`);
    console.log(`Saved successfully to .env. Public Key: ${publicKey}`);
  }

  console.log("\nNext Steps:");
  console.log(`1. Send Solana SOL (mainnet/devnet depending on target) to: ${publicKey}`);
  console.log("2. Keep the secret key private and secure. Do not share it or commit it to GitHub.");
}

main();
