import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The monthly report's PDF (ticket 34): pdfkit loads its parts with require() at run time, which the
  // bundler would break, so the server takes it from node_modules as it is.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // The request proxy copies a body before the route reads it, 10 MB by default. An import is at most
    // 5 MB (ticket 35, IMPORT_LIMITS in src/domain/orders.ts), so the copy stops one byte past that: no
    // larger upload is ever held whole. A body cut off here falls short of the length it gave, which
    // the import route refuses, so it never passes for a whole file.
    proxyClientMaxBodySize: 5 * 1024 * 1024 + 1,
  },
};

export default nextConfig;
