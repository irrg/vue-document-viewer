import { GlobalWorkerOptions } from 'pdfjs-dist';
// Vite's `?worker` import gives us a real Worker constructor bundled by the
// consumer's own build — no data: URL injection, no window.pdfjsLib global,
// and no CDN fetch for the worker script itself.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker';

let configured = false;

/**
 * Points pdfjs-dist at a bundled worker instead of its same-origin guess.
 * Idempotent — safe to call before every load.
 */
export const ensurePdfWorker = () => {
  if (configured) return;

  GlobalWorkerOptions.workerPort = new PdfWorker();
  configured = true;
};
