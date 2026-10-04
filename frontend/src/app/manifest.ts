import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bolsillo",
    short_name: "Bolsillo",
    description: "Tus finanzas personales, a mano.",
    lang: "es-CO",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf1df",
    theme_color: "#fbf1df",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
