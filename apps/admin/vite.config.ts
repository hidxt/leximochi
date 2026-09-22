import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  // 与 web 同理：工作区包产出 CommonJS，需让 dev server 预打包
  optimizeDeps: { include: ['@leximochi/api-client', '@leximochi/auth'] },
});
