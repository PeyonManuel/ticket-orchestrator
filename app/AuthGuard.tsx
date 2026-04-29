"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redirects unauthenticated users to /login, and authenticated users without
 *  an active organisation to /onboarding to create their sandbox.
 *  If the user already belongs to another org (e.g. after leaving one),
 *  auto-activates it instead of sending them to onboarding. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, orgId } = useAuth();
  const { userMemberships, setActive, isLoaded: orgsLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !orgsLoaded) return;
    if (!isSignedIn) { router.replace("/login"); return; }
    if (!orgId) {
      // User has no active org — check if they belong to any
      const firstMembership = userMemberships.data?.[0];
      if (firstMembership) {
        // Auto-activate their first available org
        setActive?.({ organization: firstMembership.organization.id });
      } else {
        // Genuinely no orgs — send to onboarding to create one
        router.replace("/onboarding");
      }
    }
  }, [isLoaded, orgsLoaded, isSignedIn, orgId, userMemberships.data, setActive, router]);

  if (!isLoaded || !orgsLoaded || !isSignedIn || !orgId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic text-white">
            O
          </div>
          <span className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-100">ORION</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
