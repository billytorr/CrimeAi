/** @type {import('next').NextConfig} */
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

const nextConfig = {
  reactStrictMode: true,
  // native builds are a fully static bundle inside the app shell;
  // the web deployment keeps its server (API routes, dynamic pages)
  ...(isCapacitor ? { output: "export", images: { unoptimized: true } } : {}),
};

module.exports = nextConfig;
