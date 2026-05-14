import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Solana Wallet",
      credentials: {
        wallet: { label: "Wallet" },
        signature: { label: "Signature" },
        nonce: { label: "Nonce" },
      },
      async authorize(credentials) {
        if (
          !credentials?.wallet ||
          !credentials?.signature ||
          !credentials?.nonce
        ) {
          return null;
        }

        const wallet = String(credentials.wallet);
        const signature = String(credentials.signature);
        const nonce = String(credentials.nonce);

        const stored = await prisma.walletNonce.findUnique({ where: { nonce } });

        if (
          !stored ||
          stored.wallet !== wallet ||
          stored.expires < new Date()
        ) {
          return null;
        }

        try {
          const publicKey = new PublicKey(wallet);
          const message = new TextEncoder().encode(
            `Sign in to NFTones — nonce: ${nonce}`
          );
          const signatureBytes = bs58.decode(signature);
          const valid = nacl.sign.detached.verify(
            message,
            signatureBytes,
            publicKey.toBytes()
          );

          if (!valid) return null;
        } catch {
          return null;
        }

        await prisma.walletNonce.delete({ where: { nonce } });

        const user = await prisma.user.upsert({
          where: { wallet },
          update: {},
          create: { wallet },
        });

        return {
          id: user.id,
          wallet: user.wallet,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.wallet = (user as any).wallet;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as any).id = token.id;
        (session.user as any).wallet = token.wallet;
      }
      return session;
    },
  },
});
