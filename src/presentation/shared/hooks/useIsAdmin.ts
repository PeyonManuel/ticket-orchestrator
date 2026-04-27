"use client";

import { useUser } from "@clerk/nextjs";

/**
 * Returns true if the current Clerk user has `publicMetadata.role === "admin"`.
 *
 * To grant admin access, set the user's publicMetadata in the Clerk dashboard:
 *   Users → select user → Metadata → Public → { "role": "admin" }
 */
export function useIsAdmin(): boolean {
  const { user } = useUser();
  return (user?.publicMetadata as { role?: string } | undefined)?.role === "admin";
}
