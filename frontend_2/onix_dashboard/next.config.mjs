/** @type {import('next').NextConfig} */
const nextConfig = {


  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['canvas'],
  },
}

export default nextConfig
