import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { AuthRedirect } from "../AuthRedirect";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950">
      {/* Client-side fallback for when server-side session verification is slow */}
      <AuthRedirect />
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-xl font-bold italic shadow-[0_0_20px_rgba(79,70,229,0.5)]">
            O
          </div>
          <span className="text-2xl font-bold tracking-tighter text-zinc-100">ORION</span>
        </div>
        <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
          <SignIn
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
                // Card shell
                card: "shadow-2xl shadow-black/50 !border !border-zinc-700",
                // Header
                headerTitle: "!text-white font-semibold",
                headerSubtitle: "!text-zinc-300",
                // Social / OAuth buttons
                socialButtonsBlockButton:
                  "!border !border-zinc-600 !bg-zinc-800 hover:!bg-zinc-700 !text-white font-medium",
                socialButtonsBlockButtonText: "!text-white font-medium",
                socialButtonsBlockButtonArrow: "!text-white",
                socialButtonsProviderIcon__github: "!invert !brightness-200",
                // Divider
                dividerLine: "!bg-zinc-600",
                dividerText: "!text-zinc-400",
                // Form fields
                formFieldLabel: "!text-zinc-200 font-medium",
                formFieldInput:
                  "!border !border-zinc-600 focus:!border-indigo-500 !text-white placeholder:!text-zinc-500",
                formFieldInputShowPasswordButton: "!text-zinc-400 hover:!text-zinc-200",
                formFieldHintText: "!text-zinc-400",
                formFieldErrorText: "!text-red-400",
                // Primary button
                formButtonPrimary:
                  "!bg-indigo-600 hover:!bg-indigo-500 !text-white font-semibold shadow-md",
                // Footer
                footerActionText: "!text-zinc-400",
                footerActionLink: "!text-indigo-400 hover:!text-indigo-300 font-medium",
                footer: "!text-zinc-600",
                // Step 2 identity preview
                identityPreviewText: "!text-zinc-200",
                identityPreviewEditButton: "!text-indigo-400 hover:!text-indigo-300",
                // Alert boxes
                alertText: "!text-zinc-200",
                // Internal form field wrapper (contains label + input)
                formFieldRow: "!text-white",
              },
            }}
          />
        </Suspense>
      </div>
    </main>
  );
}
