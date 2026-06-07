"use client";

import { Lock, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,#f8fafc,#eef7f1)] px-6">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto flex size-16 items-center justify-center rounded-lg bg-muted">
          <Lock className="size-7 text-primary" />
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-lg font-semibold">
          <Store className="size-5 text-primary" />
          Shop Account Locked
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          New shop account creation is disabled for this installation. Only approved admin credentials can access M&M SuperMart ERP.
        </p>
        <Button className="mt-6 w-full" asChild>
          <a href="/login">Back to Login</a>
        </Button>
      </section>
    </main>
  );
}
