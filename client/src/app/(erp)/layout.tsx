import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><AppShell>{children}</AppShell></AuthGuard>;
}
