import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Deliberately separate from the root vite.config.mjs, which builds the
// library with pdfjs-dist externalized. This is a real consuming app: it
// needs pdfjs-dist bundled normally so the `?worker` import resolves.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
});
