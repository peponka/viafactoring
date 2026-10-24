import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El service worker siempre se pide fresco, para que las actualizaciones
  // lleguen enseguida a la app instalada.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    // La foto/PDF de la factura puede pesar varios MB — el límite por
    // defecto de Next para Server Actions es 1MB.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
