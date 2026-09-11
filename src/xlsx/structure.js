/**
 * Structural properties of an Excel worksheet: column widths, row heights,
 * hidden rows/columns, merged ranges, and frozen panes. exceljs exposes
 * these in Excel's own units (character-width for columns, points for
 * rows, 1-based A1 references for merges) — everything here converts to
 * the normalized model's units: CSS pixels and zero-based row/col indices.
 */

const POINTS_PER_INCH = 72;
const CSS_PIXELS_PER_INCH = 96;

// Column width is stored in "character width" units: how many copies of the
// widest digit ('0'-'9') of the workbook's default font fit across the
// column. Converting to pixels needs that font's Maximum Digit Width (MDW)
// in pixels. We have no real font metrics to measure it from, so this uses
// the standard assumption most implementations fall back to: Calibri 11 at
// 96 DPI, MDW = 7px. Formula per ECMA-376 / MS-OI29500 §18.3.1.13.
const DEFAULT_MDW = 7;
// Excel's own default column width when a sheet specifies none (character
// units, Calibri 11).
const DEFAULT_COLUMN_WIDTH_CHARS = 8.43;
// Excel's own default row height (points) when a sheet specifies none.
const DEFAULT_ROW_HEIGHT_PT = 15;

/** @param {number} points */
export const pointsToPixels = (points) =>
  (points * CSS_PIXELS_PER_INCH) / POINTS_PER_INCH;

/**
 * @param {number} width - Column width in Excel's character units.
 * @param {number} [mdw] - Maximum Digit Width in pixels.
 */
export const columnWidthToPixels = (width, mdw = DEFAULT_MDW) =>
  Math.floor(((256 * width + Math.floor(128 / mdw)) / 256) * mdw);

const COLUMN_LETTERS = /^[A-Z]+/;

const columnLetterToIndex = (letters) => {
  let index = 0;

  for (let i = 0; i < letters.length; i += 1) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }

  return index; // 1-based
};

const parseCellRef = (ref) => {
  const letters = ref.match(COLUMN_LETTERS)[0];

  return {
    row: parseInt(ref.slice(letters.length), 10),
    col: columnLetterToIndex(letters),
  };
};

/**
 * @param {string} ref - e.g. 'B3' or 'A1:C3'
 * @returns {{top: number, left: number, bottom: number, right: number}} 1-based, inclusive
 */
const parseRange = (ref) => {
  const [start, end = start] = ref.split(':');
  const a = parseCellRef(start);
  const b = parseCellRef(end);

  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  };
};

/**
 * @param {import('exceljs').Worksheet} worksheet
 * @returns {{row: number, col: number, rowSpan: number, colSpan: number}[]}
 * Zero-based, anchor cell only.
 */
export const extractMerges = (worksheet) => {
  const ranges = worksheet.model?.merges ?? [];

  return ranges.map((ref) => {
    const { top, left, bottom, right } = parseRange(ref);

    return {
      row: top - 1,
      col: left - 1,
      rowSpan: bottom - top + 1,
      colSpan: right - left + 1,
    };
  });
};

/**
 * @param {import('exceljs').Worksheet} worksheet
 * @returns {{rows: number, cols: number}}
 */
export const extractFrozenPanes = (worksheet) => {
  const frozenView = (worksheet.views ?? []).find(
    (view) => view.state === 'frozen',
  );

  return {
    rows: frozenView?.ySplit ?? 0,
    cols: frozenView?.xSplit ?? 0,
  };
};

/**
 * One entry per column up to the sheet's actual used width — matches
 * `worksheet.columnCount`, so it index-aligns with each row's cells.
 * @param {import('exceljs').Worksheet} worksheet
 * @returns {{widthPx: number, hidden: boolean}[]}
 */
export const extractColumns = (worksheet) => {
  const defaultWidth =
    worksheet.properties?.defaultColWidth ?? DEFAULT_COLUMN_WIDTH_CHARS;
  const columns = [];

  for (let i = 1; i <= worksheet.columnCount; i += 1) {
    const column = worksheet.getColumn(i);

    columns.push({
      widthPx: columnWidthToPixels(column.width ?? defaultWidth),
      hidden: Boolean(column.hidden),
    });
  }

  return columns;
};

/**
 * @param {import('exceljs').Row} row
 * @param {import('exceljs').Worksheet} worksheet - for the sheet's default
 * row height, used when `row.height` isn't set.
 * @returns {number}
 */
export const extractRowHeightPx = (row, worksheet) => {
  const points =
    row.height ??
    worksheet.properties?.defaultRowHeight ??
    DEFAULT_ROW_HEIGHT_PT;

  return pointsToPixels(points);
};
