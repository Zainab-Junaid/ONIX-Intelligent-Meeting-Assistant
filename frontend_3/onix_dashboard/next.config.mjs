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
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    // Ensure backendUrl doesn't have trailing slash for consistency before appending path
    const target = backendUrl.replace(/\/$/, '');
    return [
      {
        source: '/socket.io/:path*',
        destination: `${target}/socket.io/:path*/`, 
      },
    ]
  },
}

export default nextConfig
