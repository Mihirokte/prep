import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Renderer build. The main process serves dist/renderer over prep://app/, so
// every asset path is relative.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  base: './',
  publicDir: path.resolve(import.meta.dirname, 'src/renderer/public'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    // One local bundle read from disk; the web portal's size warning does not apply.
    chunkSizeWarningLimit: 4096,
  },
  server: { port: 5199, strictPort: true },
  plugins: [react(), tailwindcss()],
})
