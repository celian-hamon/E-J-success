import type { MetadataRoute } from "next";

// Installable app manifest. Text is in the default language (French).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "E-J Success",
    short_name: "E-J Success",
    description: "Des quiz ludiques créés à partir de vos supports de cours.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#070b1f",
    theme_color: "#070b1f",
    categories: ["education", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Mes cours", url: "/student", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mon compagnon", url: "/student/pet", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
