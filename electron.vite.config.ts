import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

// Only in production builds: the dev server needs an inline script for React Fast Refresh.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: tarkov-map: https://assets.tarkov.dev https://*.tarkov-market.app https://*.tarkov-market.com",
  "connect-src 'self' tarkov-map:",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend'
      }
    ]
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), contentSecurityPolicy()]
  }
})
