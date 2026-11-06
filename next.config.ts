import type { NextConfig } from "next";

// All pages fetch live data from the local SQLite API at request time, so the
// prerendering/caching model (cacheComponents) buys nothing here and conflicts
// with client hooks like usePathname in the app shell.
const nextConfig: NextConfig = {
  cacheComponents: false,
  // the floating "N" dev-tools badge only exists in dev mode; hide it so it doesn't cover the UI
  devIndicators: false,
  // iPhone access later goes through a Tailscale HTTPS hostname
  allowedDevOrigins: ["*.ts.net"],
};

export default nextConfig;
