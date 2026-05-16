-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('FREE', 'CREATOR', 'PRO', 'LABEL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'MINTED', 'SOLD', 'FLAGGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MintMode" AS ENUM ('LAZY', 'ARTIST_PAID', 'FAN_SPONSORED', 'KTRS_CREDIT', 'PLATFORM_SPONSORED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'WATERMARKED', 'MINTED', 'DELIVERED', 'REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "wallet" TEXT,
    "tier" "Tier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FanProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drop" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artistProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audioUrl" TEXT NOT NULL,
    "masterSha256" TEXT,
    "coverArtUrl" TEXT,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "priceKtrs" DOUBLE PRECISION,
    "editionSize" INTEGER,
    "status" "DropStatus" NOT NULL DEFAULT 'DRAFT',
    "mintMode" "MintMode" NOT NULL DEFAULT 'LAZY',
    "mintedNftAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RightsDeclaration" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "masterOwner" TEXT NOT NULL,
    "publishingOwner" TEXT,
    "songwriterSplits" JSONB,
    "producerSplits" JSONB,
    "featuredSplits" JSONB,
    "sampleDisclosure" TEXT,
    "commercialAllowed" BOOLEAN NOT NULL DEFAULT false,
    "fanCollectibleOnly" BOOLEAN NOT NULL DEFAULT true,
    "exclusiveLicense" BOOLEAN NOT NULL DEFAULT false,
    "attestation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RightsDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KtrsCreditBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KtrsCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "dropId" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountKtrs" DOUBLE PRECISION,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "txSignature" TEXT,
    "mintedNftAddress" TEXT,
    "derivativeSha256" TEXT,
    "watermarkedAudioUrl" TEXT,
    "walletFingerprint" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletNonce" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_wallet_key" ON "User"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistProfile_userId_key" ON "ArtistProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistProfile_slug_key" ON "ArtistProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "FanProfile_userId_key" ON "FanProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RightsDeclaration_dropId_key" ON "RightsDeclaration"("dropId");

-- CreateIndex
CREATE UNIQUE INDEX "KtrsCreditBalance_userId_key" ON "KtrsCreditBalance"("userId");

-- CreateIndex
CREATE INDEX "Purchase_dropId_idx" ON "Purchase"("dropId");

-- CreateIndex
CREATE INDEX "Purchase_buyerWallet_idx" ON "Purchase"("buyerWallet");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletNonce_nonce_key" ON "WalletNonce"("nonce");

-- CreateIndex
CREATE INDEX "WalletNonce_wallet_idx" ON "WalletNonce"("wallet");

-- CreateIndex
CREATE INDEX "WalletNonce_expires_idx" ON "WalletNonce"("expires");

-- AddForeignKey
ALTER TABLE "ArtistProfile" ADD CONSTRAINT "ArtistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanProfile" ADD CONSTRAINT "FanProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_artistProfileId_fkey" FOREIGN KEY ("artistProfileId") REFERENCES "ArtistProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RightsDeclaration" ADD CONSTRAINT "RightsDeclaration_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KtrsCreditBalance" ADD CONSTRAINT "KtrsCreditBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
