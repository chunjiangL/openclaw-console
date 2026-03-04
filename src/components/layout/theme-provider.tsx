"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export const THEMES = [
  { key: "dark", label: "DARK" },
  { key: "light", label: "LIGHT" },
  { key: "claw", label: "CLAW" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={THEMES.map((t) => t.key)}
    >
      {children}
    </NextThemesProvider>
  );
}
