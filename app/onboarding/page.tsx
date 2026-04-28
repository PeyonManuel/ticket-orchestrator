"use client";

import { CreateOrganization } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { UserButton } from "@clerk/nextjs";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold italic">
            O
          </div>
          <span className="text-lg font-bold tracking-tighter">ORION</span>
        </div>
        <UserButton />
      </header>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="max-w-md w-full text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Create your workspace</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Your workspace is your own isolated environment. You&apos;re the admin —
            you can manage boards, run the AI orchestrator, and invite teammates
            whenever you&apos;re ready.
          </p>
          <p className="text-zinc-600 text-xs">
            This is your sandbox. No one else can see or touch your data.
          </p>
        </div>

        <CreateOrganization
          afterCreateOrganizationUrl="/"
          appearance={{
            baseTheme: dark,
            variables: {
              colorBackground: "#18181b",
              colorInputBackground: "#09090b",
              colorText: "#f4f4f5",
              colorTextSecondary: "#a1a1aa",
              colorPrimary: "#6366f1",
              colorInputText: "#f4f4f5",
              colorNeutral: "#e4e4e7",
              borderRadius: "0.5rem",
            },
            elements: {
              card: "!shadow-2xl !border !border-zinc-800 !bg-zinc-900",
              headerTitle: "!text-zinc-100",
              headerSubtitle: "!text-zinc-400",
              formButtonPrimary: "!bg-indigo-600 hover:!bg-indigo-500 !text-white",
            },
          }}
        />
      </div>
    </div>
  );
}
