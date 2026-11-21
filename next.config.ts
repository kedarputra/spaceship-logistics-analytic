import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The monthly report's PDF (ticket 34): pdfkit loads its parts with require() at run time, which the
  // bundler would break, so the server takes it from node_modules as it is.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
