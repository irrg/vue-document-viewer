/**
 * Embedded picture extraction. exceljs only supports the modern DrawingML
 * anchor format (`xdr:oneCellAnchor` / `xdr:twoCellAnchor`) — legacy VML
 * drawings (used for cell-comment images, and by some tools for header/
 * footer logos) aren't parsed into `worksheet.getImages()` at all. That's
 * an exceljs limitation, not something this module can route around: a
 * VML-only image is invisible to us the same way an unregistered format is
 * to the parser registry — it just doesn't appear, never a crash.
 */

// DrawingML measures everything in EMU (English Metric Units).
// 914,400 EMU per inch; at 96 CSS px/inch that's 9525 EMU per pixel.
const EMU_PER_PIXEL = 9525;

const emuToPixels = (emu) => emu / EMU_PER_PIXEL;

const mimeTypeForExtension = (extension) => {
  if (extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';

  return 'application/octet-stream';
};

const mediaToBlob = (media) => {
  const mimeType = mimeTypeForExtension(media.extension);

  if (media.buffer) return new Blob([media.buffer], { type: mimeType });
  if (media.base64) {
    const binary = atob(media.base64.replace(/^data:[^,]+,/, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([], { type: mimeType });
};

// A twoCellAnchor image (stretched to fit between two cells, no explicit
// size) has no ext — its size is however much space its anchor cells cover,
// so it has to be computed from real column widths/row heights rather than
// assumed EMU-per-character-unit defaults.
const spanPixels = (
  startIndex,
  startOffsetPx,
  endIndex,
  endOffsetPx,
  sizeAt,
) => {
  if (endIndex === startIndex) return endOffsetPx - startOffsetPx;

  let total = sizeAt(startIndex) - startOffsetPx;
  for (let i = startIndex + 1; i < endIndex; i += 1) total += sizeAt(i);

  return total + endOffsetPx;
};

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {import('exceljs').Worksheet} worksheet
 * @param {(colIndex: number) => number} getColumnWidthPx - zero-based
 * @param {(rowIndex: number) => number} getRowHeightPx - zero-based
 * @returns {{blob: Blob, anchor: {row: number, col: number}, offsetPx: {x: number, y: number}, widthPx: number, heightPx: number}[]}
 */
export const extractImages = (
  workbook,
  worksheet,
  getColumnWidthPx,
  getRowHeightPx,
) =>
  worksheet.getImages().map(({ imageId, range }) => {
    const media = workbook.getImage(Number(imageId));
    const offsetPx = {
      x: emuToPixels(range.tl.nativeColOff),
      y: emuToPixels(range.tl.nativeRowOff),
    };

    let widthPx = 0;
    let heightPx = 0;

    if (range.ext) {
      // exceljs's own ext-xform already converts cx/cy from EMU to px.
      ({ width: widthPx, height: heightPx } = range.ext);
    } else if (range.br) {
      widthPx = spanPixels(
        range.tl.nativeCol,
        offsetPx.x,
        range.br.nativeCol,
        emuToPixels(range.br.nativeColOff),
        getColumnWidthPx,
      );
      heightPx = spanPixels(
        range.tl.nativeRow,
        offsetPx.y,
        range.br.nativeRow,
        emuToPixels(range.br.nativeRowOff),
        getRowHeightPx,
      );
    }

    return {
      blob: mediaToBlob(media),
      anchor: { row: range.tl.nativeRow, col: range.tl.nativeCol },
      offsetPx,
      widthPx,
      heightPx,
    };
  });
