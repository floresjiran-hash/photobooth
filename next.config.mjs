/** @type {import('next').NextConfig} */
export default { reactStrictMode: true };
const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/keys/validate", destination: "/api/booth?r=keys/validate" },
    ];
  },
};
module.exports = nextConfig;