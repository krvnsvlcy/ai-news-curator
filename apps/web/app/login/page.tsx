import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
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
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Wordmark className="justify-center" />
        <div className="mt-8 rounded-lg border border-rule bg-paper p-6">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-[13px] text-muted">Enter the team password to continue.</p>
          <LoginForm from={safeRedirectPath(from)} />
        </div>
      </div>
    </main>
  );
}
