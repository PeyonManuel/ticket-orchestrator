"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redirects unauthenticated users to /login. Shows nothing while loading. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/login");
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic">
            O
          </div>
          <span className="text-2xl font-bold tracking-tighter text-zinc-100">ORION</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
