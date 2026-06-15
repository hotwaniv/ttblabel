import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { auth } from "@/app/(auth)/auth";
import { UserNav } from "@/components/verify/user-nav";
import { VerifyShell } from "@/components/verify/verify-shell";

function VerifyPageFallback() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-6">
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
      </div>
    </main>
  );
}

async function AuthenticatedVerifyPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-6">
        <UserNav />
      </div>
      <VerifyShell />
    </main>
  );
}

export default function Page() {
  return (
    <>
      <Toaster
        position="top-center"
        theme="system"
        toastOptions={{
          className:
            "!bg-card !text-foreground !border-border/50 !shadow-[var(--shadow-float)]",
        }}
      />
      <Suspense fallback={<VerifyPageFallback />}>
        <AuthenticatedVerifyPage />
      </Suspense>
    </>
  );
}
