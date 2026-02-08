/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: 'output: export' removed - it breaks ALL API routes
  // API routes are used to proxy to backend (avoids CORS issues)

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
