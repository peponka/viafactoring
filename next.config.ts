import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // La foto/PDF de la factura puede pesar varios MB — el límite por
    // defecto de Next para Server Actions es 1MB.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
