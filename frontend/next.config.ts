import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const configured = process.env.BACKEND_URL;
    if (!configured && process.env.NODE_ENV === "production") {
      throw new Error("BACKEND_URL es obligatoria en producción");
    }
    const backend = configured ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
