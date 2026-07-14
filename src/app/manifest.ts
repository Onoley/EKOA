import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ekoa",
    short_name: "Ekoa",
    description: "Répondez. Comparez. Comprenez.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6ef",
    theme_color: "#f3ff6d",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
