import type { NextConfig } from 'next'
const firebaseAuthHost = 'https://fabricut-248b4.firebaseapp.com'
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['./server/.env','./server/uploads/**/*','./server/node_modules/**/*','./.git/**/*'] },
  serverExternalPackages: ['firebase','jose','firebase-admin','cloudinary'],
  async headers() { return [{ source: '/api/:path*', headers: [{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}] }] },
  async rewrites() {
    return [
      { source: '/__/auth/:path*', destination: `${firebaseAuthHost}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `${firebaseAuthHost}/__/firebase/:path*` },
    ]
  },
}
export default config
