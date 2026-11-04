import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pcUsername = process.env.USERNAME || process.env.USER || '';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    viteSingleFile(),
  ],
  define: {
    '__PC_USERNAME__': JSON.stringify(pcUsername),
    'process.env': {},
    'global': 'window',
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
