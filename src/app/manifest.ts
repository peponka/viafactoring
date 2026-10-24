import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ViaFactoring",
    short_name: "ViaFactoring",
    description: "Facturas por cobrar y fondeadores, en un solo lugar.",
    lang: "es-PY",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f4ef",
    theme_color: "#0b6e4f",
    categories: ["finance", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Subir factura", url: "/operador/nueva", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Facturas para mí", url: "/fondeador", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
