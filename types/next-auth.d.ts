import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    wallet?: string | null;
  }

  interface Session {
    user: {
      id: string;
      wallet?: string | null;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    wallet?: string | null;
  }
}
