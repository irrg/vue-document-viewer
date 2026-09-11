import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';

import { extractImages } from './images.js';

describe('extractImages', () => {
  let workbook;
  let worksheet;

  beforeEach(() => {
    workbook = new ExcelJS.Workbook();
    worksheet = workbook.addWorksheet('Sheet1');
  });

  it('returns an empty array when there are no images', () => {
    expect(
      extractImages(
        workbook,
        worksheet,
        () => 0,
        () => 0,
      ),
    ).toEqual([]);
  });

  it('extracts an explicit-size (oneCellAnchor-style) image', () => {
    const imageId = workbook.addImage({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      extension: 'png',
    });

    worksheet.addImage(imageId, {
      tl: {
        nativeCol: 1,
        nativeColOff: 9525 * 5, // 5px
        nativeRow: 2,
        nativeRowOff: 9525 * 3, // 3px
      },
      ext: { width: 120, height: 80 },
    });

    const [image] = extractImages(
      workbook,
      worksheet,
      () => 0,
      () => 0,
    );

    expect(image.anchor).toEqual({ row: 2, col: 1 });
    expect(image.offsetPx).toEqual({ x: 5, y: 3 });
    expect(image.widthPx).toBe(120);
    expect(image.heightPx).toBe(80);
    expect(image.blob).toBeInstanceOf(Blob);
    expect(image.blob.type).toBe('image/png');
  });

  it('computes size from real column widths/row heights for a stretched (twoCellAnchor) image', () => {
    const imageId = workbook.addImage({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      extension: 'jpeg',
    });

    worksheet.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 },
      br: {
        nativeCol: 2,
        nativeColOff: 9525 * 10, // 10px into column 2
        nativeRow: 1,
        nativeRowOff: 9525 * 4, // 4px into row 1
      },
    });

    const columnWidths = [100, 50, 30];
    const rowHeights = [20, 15];
    const [image] = extractImages(
      workbook,
      worksheet,
      (i) => columnWidths[i],
      (i) => rowHeights[i],
    );

    // Column 0 in full (100) + column 1 in full (50) + 10px into column 2.
    expect(image.widthPx).toBe(160);
    // Row 0 in full (20) + 4px into row 1.
    expect(image.heightPx).toBe(24);
  });

  it('handles a single-cell span (tl and br in the same cell)', () => {
    const imageId = workbook.addImage({
      buffer: new Uint8Array([1]).buffer,
      extension: 'gif',
    });

    worksheet.addImage(imageId, {
      tl: {
        nativeCol: 0,
        nativeColOff: 9525 * 2,
        nativeRow: 0,
        nativeRowOff: 9525 * 1,
      },
      br: {
        nativeCol: 0,
        nativeColOff: 9525 * 12,
        nativeRow: 0,
        nativeRowOff: 9525 * 6,
      },
    });

    const [image] = extractImages(
      workbook,
      worksheet,
      () => 999,
      () => 999,
    );

    expect(image.widthPx).toBe(10); // 12px - 2px, doesn't touch getColumnWidthPx
    expect(image.heightPx).toBe(5);
  });

  it('builds a blob from base64 media', () => {
    const imageId = workbook.addImage({
      base64: `data:image/png;base64,${btoa('hello')}`,
      extension: 'png',
    });

    worksheet.addImage(imageId, {
      tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 },
      ext: { width: 10, height: 10 },
    });

    const [image] = extractImages(
      workbook,
      worksheet,
      () => 0,
      () => 0,
    );

    expect(image.blob).toBeInstanceOf(Blob);
    expect(image.blob.size).toBe('hello'.length);
  });

  it('extracts multiple images from the same sheet', () => {
    const id1 = workbook.addImage({
      buffer: new Uint8Array([1]).buffer,
      extension: 'png',
    });
    const id2 = workbook.addImage({
      buffer: new Uint8Array([2]).buffer,
      extension: 'jpeg',
    });

    worksheet.addImage(id1, {
      tl: { nativeCol: 0, nativeColOff: 0, nativeRow: 0, nativeRowOff: 0 },
      ext: { width: 10, height: 10 },
    });
    worksheet.addImage(id2, {
      tl: { nativeCol: 3, nativeColOff: 0, nativeRow: 3, nativeRowOff: 0 },
      ext: { width: 20, height: 20 },
    });

    const images = extractImages(
      workbook,
      worksheet,
      () => 0,
      () => 0,
    );

    expect(images).toHaveLength(2);
    expect(images[1].anchor).toEqual({ row: 3, col: 3 });
  });
});
