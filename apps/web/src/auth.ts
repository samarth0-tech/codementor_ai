import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginSchema, type PublicUser } from "@codementor/shared";
import { backendRequest } from "@/lib/server/backend";
import { clientIpFrom } from "@/lib/server/ip";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days (approved in ADR 0001)

export class SuspendedAccountError extends CredentialsSignin {
  code = "suspended";
}
export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

/**
 * Auth.js owns the login SESSION (an encrypted, httpOnly cookie). It does not own users or
 * passwords: authorize() asks Express to check the credentials and gets back only
 * { id, email, name, role }. No tokens are issued by Express.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const res = await backendRequest("/auth/verify-credentials", {
          method: "POST",
          json: parsed.data,
          identity: { ip: clientIpFrom(request.headers) },
        });

        if (res.status === 401) return null;
        if (res.status === 403) throw new SuspendedAccountError();
        if (res.status === 429) throw new RateLimitedError();
        if (!res.ok) throw new Error(`Credential check failed with status ${res.status}`);

        const { user } = (await res.json()) as { user: PublicUser };
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
