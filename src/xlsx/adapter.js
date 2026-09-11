/**
 * Assembles a NormalizedWorkbook from an exceljs Workbook — the seam
 * between "parse the bytes" (exceljs) and "render the model" (XlsxViewer),
 * per the architecture: no exceljs type crosses this boundary, only plain
 * data. This is the biggest single file in the decoder because it's the
 * only piece that touches exceljs's actual object API; colors.js,
 * numberFormats.js, structure.js, and images.js do the real work and are
 * each independently tested against that API already.
 */
import ExcelJS from 'exceljs';

import { extractThemeColors, resolveColor } from './colors.js';
import { extractImages } from './images.js';
import { formatCellValue } from './numberFormats.js';
import {
  extractColumns,
  extractFrozenPanes,
  extractMerges,
  extractRowHeightPx,
  pointsToPixels,
} from './structure.js';

const HORIZONTAL_ALIGNMENTS = new Set(['left', 'center', 'right']);
const VERTICAL_ALIGNMENTS = new Set(['top', 'middle', 'bottom']);

// Excel's own defaults when a cell has no explicit alignment.
const DEFAULT_ALIGN = 'left';
const DEFAULT_VALIGN = 'bottom';
const DEFAULT_FONT_FAMILY = 'Calibri';
const DEFAULT_FONT_SIZE_PT = 11;
const DEFAULT_FONT_COLOR = '#000000';
const DEFAULT_BORDER_COLOR = '#000000';

const clampAlign = (value) =>
  HORIZONTAL_ALIGNMENTS.has(value) ? value : DEFAULT_ALIGN;
// Excel's extra horizontal modes (justify, distributed, fill,
// centerContinuous) don't have a DOM table equivalent worth building —
// treated as their closest simple alignment.
const clampValign = (value) =>
  VERTICAL_ALIGNMENTS.has(value) ? value : DEFAULT_VALIGN;

const buildBorderSide = (side, themeColors) => {
  if (!side?.style) return null;

  return {
    style: side.style,
    color: resolveColor(side.color, themeColors, DEFAULT_BORDER_COLOR),
  };
};

// A solid patternFill's *visible* color is fgColor, not bgColor — a
// well-known OOXML inversion (bgColor only matters for the other pattern
// types, where it shows through behind fgColor's dots/lines). Non-solid
// patterns are approximated with bgColor since we don't render the pattern
// itself.
const resolveFillColor = (fill, themeColors) => {
  if (
    !fill ||
    fill.type !== 'pattern' ||
    !fill.pattern ||
    fill.pattern === 'none'
  ) {
    return null;
  }

  if (fill.pattern === 'solid') return resolveColor(fill.fgColor, themeColors);

  return (
    resolveColor(fill.bgColor, themeColors) ??
    resolveColor(fill.fgColor, themeColors)
  );
};

const buildCellStyle = (cell, themeColors) => {
  const font = cell.font ?? {};
  const alignment = cell.alignment ?? {};
  const border = cell.border ?? {};

  return {
    bold: Boolean(font.bold),
    italic: Boolean(font.italic),
    underline: Boolean(font.underline),
    strike: Boolean(font.strike),
    fontFamily: font.name || DEFAULT_FONT_FAMILY,
    fontSizePx: pointsToPixels(font.size || DEFAULT_FONT_SIZE_PT),
    color: resolveColor(font.color, themeColors, DEFAULT_FONT_COLOR),
    backgroundColor: resolveFillColor(cell.fill, themeColors),
    align: clampAlign(alignment.horizontal),
    valign: clampValign(alignment.vertical),
    wrap: Boolean(alignment.wrapText),
    borders: {
      top: buildBorderSide(border.top, themeColors),
      right: buildBorderSide(border.right, themeColors),
      bottom: buildBorderSide(border.bottom, themeColors),
      left: buildBorderSide(border.left, themeColors),
    },
    numberFormat: cell.numFmt || 'General',
  };
};

// A cell's raw value can be a rich-text run list, a hyperlink wrapper, or a
// formula result (itself possibly an error) — none of those are values in
// the normalized sense. Formulas are never evaluated (per spec); this only
// ever reads the cached result the file already carries.
// Exported for testing: exceljs's own write path can't correctly
// round-trip every value shape this needs to handle (see adapter.test.js),
// so the one case that actually depends on real-file read behavior is
// tested against this directly instead of via writeBuffer + load.
export const unwrapCellValue = (rawValue) => {
  let value = rawValue;

  for (let guard = 0; guard < 3; guard += 1) {
    if (!value || typeof value !== 'object' || value instanceof Date) break;

    if (Array.isArray(value.richText)) {
      value = value.richText.map((run) => run.text).join('');
    } else if ('result' in value) {
      value = value.result;
    } else if ('hyperlink' in value) {
      // A hyperlink cell's display text is optional — Excel shows the raw
      // URL itself when the author never overrode it with custom text. A
      // real file's cell can carry `text: undefined` explicitly (present
      // as a key, so `'text' in value` alone is true but wrong here) —
      // ?? correctly treats that the same as text being absent entirely.
      value = value.text ?? value.hyperlink;
    } else if ('error' in value) {
      value = value.error;
    } else {
      break;
    }
  }

  return value;
};

const createStyleRegistry = () => {
  const styles = [];
  const indexByKey = new Map();

  const idFor = (cell, themeColors) => {
    const style = buildCellStyle(cell, themeColors);
    const key = JSON.stringify(style);
    const existing = indexByKey.get(key);
    if (existing !== undefined) return existing;

    const index = styles.length;
    styles.push(style);
    indexByKey.set(key, index);

    return index;
  };

  return { styles, idFor };
};

const buildCell = (cell, styleId) => {
  const value = unwrapCellValue(cell.value);

  return {
    text: formatCellValue(value, cell.numFmt),
    value: value === undefined ? null : value,
    styleId,
  };
};

const buildRow = (row, worksheet, columnCount, themeColors, styleRegistry) => {
  const cells = [];

  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    cells.push(buildCell(cell, styleRegistry.idFor(cell, themeColors)));
  }

  return {
    heightPx: extractRowHeightPx(row, worksheet),
    hidden: Boolean(row.hidden),
    cells,
  };
};

const buildSheet = (workbook, worksheet, themeColors, styleRegistry) => {
  const columns = extractColumns(worksheet);
  const rows = [];

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    rows.push(
      buildRow(
        worksheet.getRow(rowNumber),
        worksheet,
        columns.length,
        themeColors,
        styleRegistry,
      ),
    );
  }

  return {
    name: worksheet.name,
    rows,
    columns,
    merges: extractMerges(worksheet),
    images: extractImages(
      workbook,
      worksheet,
      (col) => columns[col]?.widthPx ?? 0,
      (rowIndex) => rows[rowIndex]?.heightPx ?? 0,
    ),
    frozen: extractFrozenPanes(worksheet),
  };
};

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<{sheets: object[], styles: object[]}>} A NormalizedWorkbook.
 */
export const parse = async (bytes) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);

  const themeColors = extractThemeColors(workbook.model?.themes?.theme1);
  const styleRegistry = createStyleRegistry();

  // Hidden/very-hidden sheets are excluded, matching what a user would see
  // opening the file in Excel itself — a sheet tab strip built from this
  // shouldn't offer tabs Excel wouldn't show by default either.
  const sheets = workbook.worksheets
    .filter((worksheet) => worksheet.state === 'visible')
    .map((worksheet) =>
      buildSheet(workbook, worksheet, themeColors, styleRegistry),
    );

  return { sheets, styles: styleRegistry.styles };
};
