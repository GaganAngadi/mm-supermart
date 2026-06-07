"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canAccess, clearAuthSession, getAuthToken, getAuthUser, isTokenExpired } from "@/lib/auth";

function checkAccess(pathname: string) {
  const token = getAuthToken();
  const user = getAuthUser();
  if (!token || !user || isTokenExpired(token)) return "login";
  if (!canAccess(user.role, pathname)) return "forbidden";
  return "allowed";
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const access = checkAccess(pathname);
    if (access === "login") {
      clearAuthSession();
      router.replace(`/login?next=${encodeURIComponent(pathname)}` as Route);
      return;
    }

    if (access === "forbidden") {
      router.replace("/pos" as Route);
      return;
    }

    setAllowed(true);
  }, [pathname, router]);

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Checking secure session...</div>
      </main>
    );
  }

  return <>{children}</>;
}
