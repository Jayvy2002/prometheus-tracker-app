import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/app': path.resolve(root, 'src/app'),
      '@/features': path.resolve(root, 'src/features'),
      '@/shared': path.resolve(root, 'src/shared'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
