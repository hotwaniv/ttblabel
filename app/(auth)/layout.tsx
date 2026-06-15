import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-screen bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-10 px-6 py-16">
        <Link className="flex w-fit items-center gap-2" href="/">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
            <ShieldCheckIcon aria-hidden="true" className="size-4" />
          </div>
          <span className="font-medium text-sm">TTB Label Verifier</span>
        </Link>
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
