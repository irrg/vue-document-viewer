/**
 * Document format detection from file contents.
 *
 * Detection reads magic bytes rather than trusting a filename or MIME type.
 * Both lie in practice — core_api stores plenty of .xlsx uploads labelled
 * `application/vnd.ms-excel`.
 */

/** Formats `detectFormat` can report. */
export const DocumentFormat = {
  Pdf: 'pdf',
  Xlsx: 'xlsx',
  Docx: 'docx',
  Pptx: 'pptx',
  /** Pre-2007 Office: .xls, .doc, .ppt. An OLE compound document. */
  LegacyOle: 'legacy-ole',
  Rtf: 'rtf',
  Unknown: 'unknown',
};

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const RTF = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b]; // PK
/**
 * Canonical main part of each OOXML package. These appear as plain ASCII in
 * the zip's local file headers and central directory, so we can identify the
 * format without inflating anything.
 */
const OOXML_MARKERS = [
  [DocumentFormat.Xlsx, 'xl/workbook.xml'],
  [DocumentFormat.Docx, 'word/document.xml'],
  [DocumentFormat.Pptx, 'ppt/presentation.xml'],
];
/** How much of each end of the file to scan for OOXML part names. */
const SCAN_WINDOW = 256 * 1024;
const toBytes = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  return null;
};
const startsWith = (bytes, signature) =>
  bytes.length >= signature.length &&
  signature.every((byte, i) => bytes[i] === byte);
const asciiBytes = (text) =>
  Uint8Array.from(text, (char) => char.charCodeAt(0));
const includesBytes = (haystack, needle, start, end) => {
  const limit = Math.min(end, haystack.length) - needle.length;

  outer: for (let i = Math.max(0, start); i <= limit; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }

    return true;
  }

  return false;
};
/**
 * An OOXML package is a zip. Identify which kind by looking for its main part
 * name — in the central directory at the tail first, since that lists every
 * entry, then the head as a fallback for unusual writers.
 *
 * @param {Uint8Array} bytes - Raw file contents, already known to be a zip.
 * @returns {string} A `DocumentFormat` value.
 */
const detectOoxml = (bytes) => {
  const windows = [
    [Math.max(0, bytes.length - SCAN_WINDOW), bytes.length],
    [0, SCAN_WINDOW],
  ];

  for (const [start, end] of windows) {
    for (const [format, marker] of OOXML_MARKERS) {
      if (includesBytes(bytes, asciiBytes(marker), start, end)) return format;
    }
  }

  // A zip we can't identify — could be an actual .zip upload, of which
  // core_api holds plenty.
  return DocumentFormat.Unknown;
};

/**
 * Identify a document from its leading bytes.
 *
 * @param {ArrayBuffer | Uint8Array} input - Raw file contents.
 * @returns {string} A `DocumentFormat` value.
 */
export const detectFormat = (input) => {
  const bytes = toBytes(input);

  if (!bytes || bytes.length < 8) return DocumentFormat.Unknown;
  if (startsWith(bytes, PDF)) return DocumentFormat.Pdf;
  if (startsWith(bytes, RTF)) return DocumentFormat.Rtf;
  if (startsWith(bytes, OLE)) return DocumentFormat.LegacyOle;
  if (startsWith(bytes, ZIP)) return detectOoxml(bytes);

  return DocumentFormat.Unknown;
};

/**
 * Read only as much of a Blob as detection needs, then identify it.
 *
 * Reads both ends of the file so OOXML central-directory scanning still works
 * without pulling a large workbook into memory.
 *
 * @param {Blob} blob - The file to identify.
 * @returns {Promise<string>} A `DocumentFormat` value.
 */
export const detectFormatFromBlob = async (blob) => {
  if (blob.size <= SCAN_WINDOW * 2) {
    return detectFormat(await blob.arrayBuffer());
  }

  const head = new Uint8Array(await blob.slice(0, SCAN_WINDOW).arrayBuffer());

  if (!startsWith(head, ZIP)) return detectFormat(head);

  // Zip: stitch head and tail so the central directory is in range.
  const tail = new Uint8Array(
    await blob.slice(blob.size - SCAN_WINDOW).arrayBuffer(),
  );
  const joined = new Uint8Array(head.length + tail.length);

  joined.set(head);
  joined.set(tail, head.length);

  return detectFormat(joined);
};
