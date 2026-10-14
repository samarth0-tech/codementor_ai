import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/actions";
import { Button, ButtonLink } from "@/components/ui/button";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="font-semibold tracking-tight">
          CodeMentor <span className="text-indigo-600">AI</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <ButtonLink href="/problems" variant="ghost">
                Problems
              </ButtonLink>
              <ButtonLink href="/interviews" variant="ghost">
                Interviews
              </ButtonLink>
              <span className="hidden text-sm text-slate-600 sm:inline dark:text-slate-300">
                {user.name}
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register">Get started</ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
