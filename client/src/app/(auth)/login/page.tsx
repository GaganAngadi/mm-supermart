"use client";

import { Boxes, IndianRupee, Lock, Mail, ReceiptText, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { saveAuthSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Enter your shop owner or staff login details.");
  const [loading, setLoading] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("Signing in...");
    try {
      const result = await apiRequest<{ token: string; refreshToken?: string; user: { name: string; email?: string; role: string; shopName?: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      saveAuthSession(result.token, result.user);
      if (result.refreshToken) localStorage.setItem("refresh-token", result.refreshToken);
      const nextPath = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      router.push(nextPath as Route);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen overflow-hidden bg-background lg:grid-cols-[0.9fr_1.1fr]">
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-white shadow-soft">
              <img src="/mm-logo.jpg" alt="M&M SuperMart logo" className="h-full w-full object-contain p-1" />
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight">M&M SuperMart</p>
              <p className="text-sm text-muted-foreground">Billing and inventory workspace</p>
            </div>
          </div>
          <h1 className="page-title text-4xl font-semibold">Sign in to the store desk</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Open the counter, review stock, and continue daily billing from a protected staff workspace.</p>
          <form className="mt-8 space-y-4 rounded-lg border bg-card p-5 shadow-soft" onSubmit={login}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-id">User ID</label>
              <Input id="user-id" icon={Mail} type="email" placeholder="Enter user ID / email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="password">Password</label>
              <Input id="password" icon={Lock} type="password" placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <input className="size-4 rounded border-border accent-emerald-700" type="checkbox" /> Remember me
              </label>
              <a className="font-medium text-primary" href="/forgot-password">Forgot password?</a>
            </div>
            <Button className="w-full" size="lg" disabled={loading}>{loading ? "Logging in" : "Login"}</Button>
          </form>
          <div className="mt-5 rounded-lg border bg-white/80 p-4 text-sm text-muted-foreground">{message}</div>
          <p className="mt-4 text-sm text-muted-foreground">Use the store login issued by the administrator.</p>
        </div>
      </section>
      <section className="hidden p-6 lg:block">
        <div className="relative flex h-full min-h-[720px] overflow-hidden rounded-lg bg-slate-950 text-white shadow-2xl">
          <div className="hairline-grid absolute inset-0 opacity-10" />
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-primary/35 blur-3xl" />
          <div className="absolute -bottom-28 left-12 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative flex h-full w-full flex-col justify-between p-10">
            <div>
              <p className="text-sm font-medium uppercase text-white/60">Counter ready</p>
              <h2 className="mt-6 max-w-2xl text-5xl font-semibold leading-tight">A calm workspace for fast supermarket billing.</h2>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_260px] xl:items-end">
              <div className="grid gap-3 text-sm text-white/82">
                <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/8 p-3"><ShieldCheck className="size-5 text-primary" /> Staff roles stay protected</div>
                <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/8 p-3"><ReceiptText className="size-5 text-accent" /> Receipts and GST reports stay ready</div>
                <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/8 p-3"><Boxes className="size-5 text-primary" /> Stock changes flow from billing</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white p-5 text-slate-950 shadow-2xl">
                <div className="flex items-center gap-3">
                  <IndianRupee className="size-8 text-primary" />
                  <div>
                    <p className="text-sm text-slate-500">Today view</p>
                    <p className="text-2xl font-semibold">Billing first</p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-slate-100 p-3">POS</div>
                  <div className="rounded-md bg-slate-100 p-3">Stock</div>
                  <div className="rounded-md bg-slate-100 p-3">Reports</div>
                  <div className="rounded-md bg-slate-100 p-3">Accounts</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
