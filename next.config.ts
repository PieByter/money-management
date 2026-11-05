import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // NEXT_DIST_DIR memungkinkan build produksi tanpa menabrak .next milik dev server
  // yang sedang berjalan (mis. NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Foto struk dikirim sebagai base64 melalui Server Action. Client sudah
    // memperkecil gambar, batas ini hanya jaring pengaman.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
