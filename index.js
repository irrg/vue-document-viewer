export {
  DocumentFormat,
  detectFormat,
  detectFormatFromBlob,
} from './src/detectFormat.js';
export {
  getWorkbookParser,
  registerWorkbookParser,
} from './src/parserRegistry.js';
export { default as PdfViewer } from './src/components/PdfViewer.vue';
