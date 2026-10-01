import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number(env.VITE_DEV_PORT ?? 5173);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: devPort,
      host: '0.0.0.0',

      allowedHosts: ['gabrielkleinpc.tail6c9d7c.ts.net'],

      proxy: {
        '/api': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001',
      },
    },
  };
});
