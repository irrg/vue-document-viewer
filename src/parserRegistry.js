/**
 * Pluggable format → workbook-parser mapping.
 *
 * Only `xlsx` and any future legacy spreadsheet formats live here — PDF and
 * DOCX are each handled by one fixed library, so they need no such seam. A
 * missing entry is the signal to render the fallback; callers must not treat
 * it as an error.
 */
const parserLoaders = new Map();

/**
 * @param {string} format - A `DocumentFormat` value.
 * @param {() => Promise<{ parse(bytes: Uint8Array): Promise<object> }>} loader
 */
export const registerWorkbookParser = (format, loader) => {
  parserLoaders.set(format, loader);
};

/**
 * @param {string} format - A `DocumentFormat` value.
 * @returns {(() => Promise<{ parse: Function }>) | undefined}
 */
export const getWorkbookParser = (format) => parserLoaders.get(format);
