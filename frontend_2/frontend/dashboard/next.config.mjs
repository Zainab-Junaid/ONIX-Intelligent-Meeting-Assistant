/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',   // removed for API routes to work


  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
