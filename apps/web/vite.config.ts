import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  // 工作区包产出 CommonJS，Vite 默认会把软链的源码式包当 ESM 直接加载而报
  // "does not provide an export named ..."，因此显式让 dev server 预打包它们。
  optimizeDeps: {
    include: ['@leximochi/api-client', '@leximochi/auth'],
  },
});
