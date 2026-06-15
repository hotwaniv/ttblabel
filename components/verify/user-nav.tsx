"use client";

import { LogOutIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function UserNav() {
  const { data: session } = useSession();
  const username = session?.user?.username;

  if (!username) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-sm">
        Signed in as{" "}
        <span className="font-medium text-foreground">{username}</span>
      </span>
      <Button
        onClick={() =>
          signOut({ callbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/login` })
        }
        size="sm"
        type="button"
        variant="outline"
      >
        <LogOutIcon aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );
}
