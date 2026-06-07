import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-md rounded-lg border bg-card p-8 shadow-soft">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your account email. The API is ready to connect your email provider for secure reset links.</p>
        <form className="mt-6 space-y-4">
          <Input icon={Mail} type="email" placeholder="you@mmsupermart.com" />
          <Button className="w-full">Send reset link</Button>
        </form>
      </section>
    </main>
  );
}
