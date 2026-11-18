import type { MetadataRoute } from "next";

/** Permite "Agregar a pantalla de inicio" en el celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CapitalOS",
    short_name: "CapitalOS",
    description: "Finanzas personales y patrimonio.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#161614",
    lang: "es-MX",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
