"use client";

import { useAuth } from "@clerk/nextjs";

export function useIsAdmin(): boolean {
  const { orgRole } = useAuth();
  return orgRole === "org:admin";
}
