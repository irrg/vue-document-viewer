import { DocumentFormat } from './src/detectFormat.js';
import { registerWorkbookParser } from './src/parserRegistry.js';

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
export { default as XlsxViewer } from './src/components/XlsxViewer.vue';

// Registering the loader is free — it's just a thunk in a Map. The actual
// dynamic import() (and exceljs's real download weight) only happens the
// first time a caller actually opens an .xlsx file.
registerWorkbookParser(
  DocumentFormat.Xlsx,
  () => import('./src/xlsx/adapter.js'),
);
