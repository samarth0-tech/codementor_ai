import type { DefaultSession } from "next-auth";
import type { Role } from "@codementor/shared";

declare module "next-auth" {
  interface Session {
    // `role` here is for the UI only (menus, redirects). The API always re-checks the database.
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

// Auth.js v5 defines the JWT type in @auth/core.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
