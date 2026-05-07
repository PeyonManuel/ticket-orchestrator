"use client";

import { Suspense, useEffect, useState } from "react";
import { SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function AcceptInvitePage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const [showExpiredMessage, setShowExpiredMessage] = useState(false);

  useEffect(() => {
    if (isSignedIn && !signingOut) {
      const params = new URLSearchParams(window.location.search);

      setSigningOut(true);
      signOut().then(() => {
        router.replace(
          "/accept-invite" + (params.toString() ? `?${params.toString()}` : ""),
        );
      });
    }
  }, [isSignedIn, signingOut, signOut]);

  // Check if invite ticket is missing or invalid (already used)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("__clerk_ticket");
    const invitationId = params.get("invitation_id");

    // If neither ticket nor invitation_id present, likely expired/used
    if (!ticket && !invitationId) {
      setShowExpiredMessage(true);
    }
  }, []);

  if (showExpiredMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-6 max-w-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic shadow-[0_0_20px_rgba(79,70,229,0.5)]">
              O
            </div>
            <span className="text-2xl font-bold tracking-tighter text-zinc-100">
              ORION
            </span>
          </div>

          <div className="rounded-lg border border-amber-200/20 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-200">
              Invitation expired or already used
            </p>
            <p className="mt-2 text-xs text-amber-200/80">
              This invitation link has already been claimed or is no longer
              valid. Contact the person who invited you to send a new
              invitation.
            </p>
          </div>

          <a
            href="/login"
            className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Sign in instead
          </a>
        </div>
      </main>
    );
  }

  if (signingOut) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic shadow-[0_0_20px_rgba(79,70,229,0.5)]">
              O
            </div>
            <span className="text-2xl font-bold tracking-tighter text-zinc-100">
              ORION
            </span>
          </div>
          <p className="text-sm text-zinc-400">Setting up your account...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic shadow-[0_0_20px_rgba(79,70,229,0.5)]">
            O
          </div>
          <span className="text-2xl font-bold tracking-tighter text-zinc-100">
            ORION
          </span>
        </div>

        <p className="text-sm text-zinc-400">
          You've been invited to a workspace. Create your account to get
          started.
        </p>

        <Suspense
          fallback={<div className="text-sm text-zinc-500">Loading...</div>}
        >
          <SignUp
            forceRedirectUrl="/"
            appearance={{
              baseTheme: dark,
              variables: {
                colorBackground: "#1c1c22",
                colorInputBackground: "#09090b",
                colorInputText: "#f4f4f5",
                colorText: "#f4f4f5",
                colorTextSecondary: "#a1a1aa",
                colorTextOnPrimaryBackground: "#ffffff",
                colorPrimary: "#818cf8",
                colorDanger: "#f87171",
                colorNeutral: "#e4e4e7",
                borderRadius: "0.5rem",
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.9375rem",
              },
              elements: {
                card: "shadow-2xl shadow-black/50 !border !border-zinc-700",
                headerTitle: "!text-white font-semibold",
                headerSubtitle: "!text-zinc-300",
                socialButtonsBlockButton:
                  "!border !border-zinc-600 !bg-zinc-800 hover:!bg-zinc-700 !text-white font-medium",
                socialButtonsBlockButtonText: "!text-white font-medium",
                socialButtonsBlockButtonArrow: "!text-white",
                socialButtonsProviderIcon__github: "!invert !brightness-200",
                dividerLine: "!bg-zinc-600",
                dividerText: "!text-zinc-400",
                formFieldLabel: "!text-zinc-200 font-medium",
                formFieldInput:
                  "!border !border-zinc-600 focus:!border-indigo-500 !text-white placeholder:!text-zinc-500",
                formFieldInputShowPasswordButton:
                  "!text-zinc-400 hover:!text-zinc-200",
                formFieldHintText: "!text-zinc-400",
                formFieldErrorText: "!text-red-400",
                formButtonPrimary:
                  "!bg-indigo-600 hover:!bg-indigo-500 !text-white font-semibold shadow-md",
                footerActionText: "!text-zinc-400",
                footerActionLink:
                  "!text-indigo-400 hover:!text-indigo-300 font-medium",
                footer: "!text-zinc-600",
                alertText: "!text-zinc-200",
                formFieldRow: "!text-white",
              },
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}
