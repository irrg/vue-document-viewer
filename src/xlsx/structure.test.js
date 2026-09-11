import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  columnWidthToPixels,
  extractColumns,
  extractFrozenPanes,
  extractMerges,
  extractRowHeightPx,
  pointsToPixels,
} from './structure.js';

describe('pointsToPixels', () => {
  it('converts points to pixels at 96 DPI', () => {
    expect(pointsToPixels(15)).toBe(20); // Excel's own default row height
    expect(pointsToPixels(72)).toBe(96); // 1 inch
  });
});

describe('columnWidthToPixels', () => {
  it('applies the ECMA-376 character-width formula', () => {
    // width=10, MDW=7: floor(((2560 + floor(128/7)) / 256) * 7)
    //                = floor(((2560 + 18) / 256) * 7) = floor(70.4921875) = 70
    expect(columnWidthToPixels(10, 7)).toBe(70);
  });

  it('defaults to a Calibri-11-at-96dpi Maximum Digit Width of 7px', () => {
    expect(columnWidthToPixels(10)).toBe(columnWidthToPixels(10, 7));
  });
});

describe('with a real exceljs worksheet', () => {
  let workbook;
  let worksheet;

  beforeEach(() => {
    workbook = new ExcelJS.Workbook();
    worksheet = workbook.addWorksheet('Sheet1');
  });

  describe('extractMerges', () => {
    it('returns an empty array when there are no merges', () => {
      expect(extractMerges(worksheet)).toEqual([]);
    });

    it('converts a merged range to a zero-based anchor span', () => {
      worksheet.mergeCells('B2:D4');

      expect(extractMerges(worksheet)).toEqual([
        { row: 1, col: 1, rowSpan: 3, colSpan: 3 },
      ]);
    });

    it('handles a single-cell "merge" and multi-letter columns', () => {
      worksheet.mergeCells('AA1:AB1');

      expect(extractMerges(worksheet)).toEqual([
        { row: 0, col: 26, rowSpan: 1, colSpan: 2 },
      ]);
    });

    it('handles multiple merges on the same sheet', () => {
      worksheet.mergeCells('A1:B1');
      worksheet.mergeCells('A2:A3');

      const merges = extractMerges(worksheet);

      expect(merges).toContainEqual({ row: 0, col: 0, rowSpan: 1, colSpan: 2 });
      expect(merges).toContainEqual({ row: 1, col: 0, rowSpan: 2, colSpan: 1 });
    });
  });

  describe('extractFrozenPanes', () => {
    it('returns zero/zero when there is no frozen view', () => {
      expect(extractFrozenPanes(worksheet)).toEqual({ rows: 0, cols: 0 });
    });

    it('reads xSplit/ySplit from a frozen view', () => {
      worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

      expect(extractFrozenPanes(worksheet)).toEqual({ rows: 2, cols: 1 });
    });

    it('ignores a non-frozen view', () => {
      worksheet.views = [{ state: 'normal' }];

      expect(extractFrozenPanes(worksheet)).toEqual({ rows: 0, cols: 0 });
    });
  });

  describe('extractColumns', () => {
    it('uses the explicit width and hidden flag when set', () => {
      worksheet.getCell('A1').value = 'x';
      worksheet.getColumn(1).width = 10;
      worksheet.getColumn(1).hidden = true;

      const [first] = extractColumns(worksheet);

      expect(first).toEqual({ widthPx: columnWidthToPixels(10), hidden: true });
    });

    it('falls back to the sheet default width for an unconfigured column', () => {
      worksheet.getCell('B1').value = 'x'; // forces columnCount to include col B
      worksheet.properties.defaultColWidth = 12;

      const columns = extractColumns(worksheet);

      expect(columns[1]).toEqual({
        widthPx: columnWidthToPixels(12),
        hidden: false,
      });
    });

    it('has one entry per used column, aligned with row cell indices', () => {
      worksheet.getCell('C1').value = 'x';

      expect(extractColumns(worksheet)).toHaveLength(3);
    });
  });

  describe('extractRowHeightPx', () => {
    it('uses an explicit row height', () => {
      const row = worksheet.getRow(1);
      row.height = 30;

      expect(extractRowHeightPx(row, worksheet)).toBe(pointsToPixels(30));
    });

    it('falls back to the sheet default row height', () => {
      worksheet.properties.defaultRowHeight = 18;
      const row = worksheet.getRow(1);

      expect(extractRowHeightPx(row, worksheet)).toBe(pointsToPixels(18));
    });

    it("falls back to Excel's own default (15pt) when nothing is set", () => {
      const row = worksheet.getRow(1);

      expect(extractRowHeightPx(row, worksheet)).toBe(pointsToPixels(15));
    });
  });
});
