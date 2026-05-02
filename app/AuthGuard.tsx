"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const Spinner = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
    <div className="flex items-center gap-3 animate-pulse">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic text-white">
        O
      </div>
      <span className="text-2xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-100">ORION</span>
    </div>
  </div>
);

/**
 * Inner guard — only mounted when the user is confirmed signed-in.
 * Calling useOrganizationList here avoids the Clerk warning that fires
 * when the hook is called without an active session.
 */
function OrgGuard({ children }: { children: React.ReactNode }) {
  const { orgId } = useAuth();
  const { userMemberships, setActive, isLoaded: orgsLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const router = useRouter();

  useEffect(() => {
    if (!orgsLoaded) return;
    if (!orgId) {
      const firstMembership = userMemberships.data?.[0];
      if (firstMembership) {
        setActive?.({ organization: firstMembership.organization.id });
      } else {
        router.replace("/onboarding");
      }
    }
  }, [orgsLoaded, orgId, userMemberships.data, setActive, router]);

  if (!orgsLoaded || !orgId) return <Spinner />;
  return <>{children}</>;
}

/** Top-level guard: redirects unauthenticated users to /login. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/login");
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) return <Spinner />;
  if (!isSignedIn) return <Spinner />;
  return <OrgGuard>{children}</OrgGuard>;
}
