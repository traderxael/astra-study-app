import type { MetadataRoute } from "next";

/**
 * manifest.webmanifest (Task 9): hace la app instalable como PWA, igual
 * que Astra AI (que usa manifest + display standalone). theme/background
 * #0d0d0d para que la ventana instalada arranque en el mismo negro.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Astra Study",
    short_name: "Astra",
    description: "Tu espacio personal de estudio: tutor con citas, fichas y práctica.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    orientation: "portrait",
    categories: ["education", "productivity"],
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}