import type { AssertionClaims } from "@codementor/shared/assertion";
import type { Role } from "@codementor/shared";

declare global {
  namespace Express {
    interface Request {
      id: string;
      /** Set by requireAssertion: proves the request came from our Next.js server. */
      assertion?: AssertionClaims;
      /** Set by authenticate: the user loaded from the database. Role comes from the DB. */
      user?: { id: string; email: string; name: string; role: Role };
    }
  }
}

export {};
