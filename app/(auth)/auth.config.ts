import type { NextAuthConfig } from "next-auth";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const authConfig = {
  basePath: "/api/auth",
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: `${base}/login`,
    newUser: `${base}/register`,
  },
  providers: [],
  callbacks: {},
} satisfies NextAuthConfig;
