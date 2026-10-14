import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ApiError } from "@/lib/api/errors";
import { backendJson } from "./backend";
import { clientIpFrom } from "./ip";

/**
 * GET from Express inside a Server Component, as the signed-in user.
 * Handles the three situations every page would otherwise repeat:
 * no session -> login, stale/suspended account -> login with a message, unknown id -> 404.
 */
export async function serverGet<T>(path: string): Promise<T> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  try {
    return await backendJson<T>(path, {
      identity: { sub: session.user.id, ip: clientIpFrom(await headers()) },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.status === 403) redirect("/login?error=session");
      if (error.status === 404) notFound();
    }
    throw error;
  }
}
