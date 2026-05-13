import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-utils';
          if (id.includes('@supabase')) return 'supabase';
          // Let Rollup auto-group remaining dependencies to avoid
          // circular references between forced manual chunks.
          return;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/email": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api/admin": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})