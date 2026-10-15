import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { include: ['tests/**/*.test.ts'] },
  server: { host: '127.0.0.1' },
});
