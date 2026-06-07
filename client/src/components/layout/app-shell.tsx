"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, Bell, BookOpenCheck, Building2, CreditCard, LayoutDashboard, LogOut, Menu, Moon, PackagePlus, Settings, ShieldCheck, ShoppingCart, Truck, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { canAccess, clearAuthSession, getAuthUser } from "@/lib/auth";
import { useProductStore } from "@/lib/stores/product-store";
import { cn } from "@/lib/utils";

const nav: Array<{ href: Route; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS Billing", icon: CreditCard },
  { href: "/inventory" as Route, label: "Inventory", icon: PackagePlus },
  { href: "/accounting" as Route, label: "Accounting", icon: BookOpenCheck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/employees", label: "Employees", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const lastNotificationCountRef = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const { products } = useProductStore();
  const user = getAuthUser();
  const visibleNav = useMemo(() => nav.filter((item) => canAccess(user?.role ?? "Cashier", item.href)), [user?.role]);
  const lowStockProducts = useMemo(() => products.filter((product) => product.stock > 0 && product.stock <= 5), [products]);
  const outOfStockProducts = useMemo(() => products.filter((product) => product.stock <= 0), [products]);
  const notificationCount = lowStockProducts.length + outOfStockProducts.length;

  function playLowStockBeep() {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = 740;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      window.setTimeout(() => {
        oscillator.frequency.value = 520;
      }, 90);
      window.setTimeout(() => {
        oscillator.stop();
        audio.close();
      }, 180);
    } catch {
      // Browser may block sound until the first user interaction.
    }
  }

  useEffect(() => {
    if (notificationCount > lastNotificationCountRef.current) playLowStockBeep();
    lastNotificationCountRef.current = notificationCount;
  }, [notificationCount]);

  useEffect(() => {
    function handleGlobalShortcuts(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const shortcuts: Record<string, Route> = {
        "1": "/dashboard",
        "2": "/pos",
        "3": "/customers",
        "4": "/reports",
        n: "/pos"
      };
      const route = shortcuts[event.key.toLowerCase()];
      if (!route || !canAccess(user?.role ?? "Cashier", route)) return;
      event.preventDefault();
      router.push(route);
    }
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [router, user?.role]);

  function logout() {
    clearAuthSession();
    router.replace("/login" as Route);
  }

  const sidebar = (
    <aside className="flex h-full flex-col border-r border-slate-900/10 bg-slate-950 text-slate-100 shadow-xl">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white">
            <img src="/mm-logo.jpg" alt="M&M SuperMart logo" className="h-full w-full object-contain" />
          </span>
          <span>
            <span className="block text-base font-semibold">M&M SuperMart</span>
            <span className="block text-xs text-slate-400">Store operations</span>
          </span>
        </Link>
        <Button className="text-slate-200 hover:bg-white/10 lg:hidden" variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="size-5" /></Button>
      </div>
      <nav className="grid gap-1 px-3 py-4">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn("group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-400 transition-all duration-200 hover:bg-white/10 hover:text-white", active && "bg-white text-slate-950 shadow-sm hover:bg-white hover:text-slate-950")}>
              <Icon className={cn("size-4 text-slate-500 group-hover:text-current", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Building2 className="size-4 text-accent" /> Main Branch</div>
          <p className="mt-2 text-xs text-slate-400">{user?.name ?? "User"} · {user?.role ?? "Cashier"}</p>
          <Button className="mt-3 w-full border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" variant="outline" size="sm" onClick={logout}><LogOut className="size-4" /> Logout</Button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-grid min-h-screen">
      <div className="hidden lg:block">{sidebar}</div>
      {open ? <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}><div className="h-full w-[280px]" onClick={(event) => event.stopPropagation()}>{sidebar}</div></div> : null}
      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/82 px-4 backdrop-blur-xl lg:px-6">
          <div className="flex items-center gap-3">
            <Button className="lg:hidden" variant="ghost" size="icon" onClick={() => setOpen(true)}><Menu className="size-5" /></Button>
            <div>
              <p className="text-sm font-semibold">M&M Billing Workspace</p>
              <p className="hidden text-xs text-muted-foreground sm:block">Billing, stock, accounts, customers, and daily reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button variant="outline" size="icon" onClick={() => { if (notificationCount) playLowStockBeep(); setNotificationsOpen((current) => !current); }} title="Stock notifications">
                <Bell className="size-4" />
                {notificationCount ? <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">{notificationCount}</span> : null}
              </Button>
              {notificationsOpen ? (
                <div className="surface-panel absolute right-0 top-12 z-50 w-80 rounded-lg border p-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <p className="font-semibold">Stock Notifications</p>
                    <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen(false)}><X className="size-4" /></Button>
                  </div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                    {outOfStockProducts.map((product) => (
                      <div className="flex w-full items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800" key={product.sku}>
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span><span className="block font-medium">{product.name}</span><span className="text-xs">Out of stock · {product.sku}</span></span>
                      </div>
                    ))}
                    {lowStockProducts.map((product) => (
                      <div className="flex w-full items-start gap-3 rounded-md border bg-background p-3 text-left text-sm" key={product.sku}>
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
                        <span><span className="block font-medium">{product.name}</span><span className="text-xs text-muted-foreground">Low stock: {product.stock} left / {product.sku}</span></span>
                      </div>
                    ))}
                    {!notificationCount ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No low-stock notifications. Inventory is healthy.</p> : null}
                  </div>
                </div>
              ) : null}
            </div>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Moon className="size-4" /></Button>
            <Button variant="accent" onClick={() => router.push("/pos" as Route)}><ShoppingCart className="size-4" /> New Sale</Button>
          </div>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
