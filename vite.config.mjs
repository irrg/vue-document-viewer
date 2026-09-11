import { fileURLToPath } from 'node:url';
import path from 'path';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'index.js'),
      name: 'vue-document-viewer',
      formats: ['es'],
      fileName: (format) => `vue-document-viewer.${format}.js`,
    },
    rollupOptions: {
      // Parsers stay external so consumers resolve and dedupe them normally,
      // and so a page that only previews PDFs never downloads exceljs.
      external: [
        'vue',
        'primevue',
        /^primevue\/.*/,
        /^@primevue\/.*/,
        'exceljs',
        'docx-preview',
        /^pdfjs-dist(\/.*)?$/,
      ],
      output: {
        globals: {
          vue: 'Vue',
          primevue: 'PrimeVue',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    root: fileURLToPath(new URL('./', import.meta.url)),
  },
});
