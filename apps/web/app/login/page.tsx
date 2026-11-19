import { redirect } from "next/navigation";
import { EditorialWordmark } from "@/components/editorial";
import { getPasswordHint } from "@/lib/auth/config";
import { isAuthenticated, safeRedirectPath } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · AI News Curator" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  if (await isAuthenticated()) redirect(safeRedirectPath(from));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <EditorialWordmark className="text-3xl" />
        <h1 className="mt-10 font-serif text-[32px] leading-tight tracking-tight">Welcome back.</h1>
        <p className="mt-3 font-serif text-lg text-muted">Enter the team password to continue.</p>
        <LoginForm from={safeRedirectPath(from)} hint={getPasswordHint()} />
      </div>
    </main>
  );
}
