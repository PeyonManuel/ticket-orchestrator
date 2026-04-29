"use client";

import { useEffect, useState } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

const darkAppearance = {
  baseTheme: dark,
  variables: {
    colorBackground: "#18181b",
    colorInputBackground: "#09090b",
    colorText: "#f4f4f5",
    colorTextSecondary: "#a1a1aa",
    colorPrimary: "#6366f1",
    colorInputText: "#f4f4f5",
    colorNeutral: "#71717a",
    colorTextOnPrimaryBackground: "#ffffff",
    colorShimmer: "#27272a",
  },
  elements: {
    modalContent: { background: "#18181b", borderColor: "#3f3f46" },
    card: { background: "#18181b", borderColor: "#3f3f46", boxShadow: "0 25px 50px rgba(0,0,0,0.6)" },
    navbar: { background: "#09090b", borderColor: "#27272a" },
    headerTitle: { color: "#f4f4f5" },
    headerSubtitle: { color: "#a1a1aa" },
    footer: { background: "#18181b" },
    formButtonPrimary: { background: "#6366f1", color: "#ffffff" },
  },
} as const;

const lightAppearance = {
  variables: {
    colorBackground: "#ffffff",
    colorInputBackground: "#f4f4f5",
    colorText: "#18181b",
    colorTextSecondary: "#71717a",
    colorPrimary: "#6366f1",
    colorInputText: "#18181b",
    colorNeutral: "#71717a",
    colorTextOnPrimaryBackground: "#ffffff",
  },
  elements: {
    modalContent: { background: "#ffffff", borderColor: "#e4e4e7" },
    card: { background: "#ffffff", borderColor: "#e4e4e7" },
    navbar: { background: "#f4f4f5", borderColor: "#e4e4e7" },
    headerTitle: { color: "#18181b" },
    headerSubtitle: { color: "#71717a" },
    footer: { background: "#ffffff" },
    formButtonPrimary: { background: "#6366f1", color: "#ffffff" },
  },
} as const;

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Sync with whatever ThemeProvider wrote to the html element
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));

    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <ClerkProvider appearance={isDark ? darkAppearance : lightAppearance}>
      {children}
    </ClerkProvider>
  );
}
