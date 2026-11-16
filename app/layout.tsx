import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Metadata + theme (Task 9): paridad con Astra AI.
 * theme_color/background_color #0d0d0d (su manifest), PWA instalable vía
 * /manifest.webmanifest (app/manifest.ts), y color-scheme dark.
 */
export const metadata: Metadata = {
  title: "Astra Study",
  description: "Tu espacio personal de estudio — tutor con citas, fichas y práctica",
  applicationName: "Astra Study",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Astra Study",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d0d0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}