import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { parse, unwrapCellValue } from './adapter.js';

// Full round trip: build a real workbook, serialize it, then parse those
// bytes exactly like a real upload would arrive. Anything that only worked
// against exceljs's in-memory object model (and would break once real XML
// serialization/deserialization is in the loop) gets caught here.
const parseWorkbook = async (build) => {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();

  return parse(new Uint8Array(buffer));
};

describe('parse', () => {
  it('produces one sheet per visible worksheet, in order', async () => {
    const result = await parseWorkbook((workbook) => {
      workbook.addWorksheet('First');
      workbook.addWorksheet('Second');
    });

    expect(result.sheets.map((sheet) => sheet.name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('excludes hidden and veryHidden sheets', async () => {
    const result = await parseWorkbook((workbook) => {
      workbook.addWorksheet('Visible');
      workbook.addWorksheet('Hidden', { state: 'hidden' });
      workbook.addWorksheet('VeryHidden', { state: 'veryHidden' });
    });

    expect(result.sheets.map((sheet) => sheet.name)).toEqual(['Visible']);
  });

  it('renders string, number, and boolean cells', async () => {
    const result = await parseWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.getCell('A1').value = 'hello';
      sheet.getCell('B1').value = 42;
      sheet.getCell('C1').value = true;
    });

    const [row1] = result.sheets[0].rows;
    expect(row1.cells[0]).toMatchObject({ text: 'hello', value: 'hello' });
    expect(row1.cells[1]).toMatchObject({ text: '42', value: 42 });
    expect(row1.cells[2]).toMatchObject({ text: 'true', value: true });
  });

  it('renders a date cell using its number format', async () => {
    const result = await parseWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1');
      const cell = sheet.getCell('A1');
      cell.value = new Date(Date.UTC(2024, 5, 15));
      cell.numFmt = 'yyyy-mm-dd';
    });

    const cell = result.sheets[0].rows[0].cells[0];
    expect(cell.value).toBeInstanceOf(Date);
    expect(cell.text).toContain('2024');
  });

  it('renders a formula cell using its cached result, never the formula itself', async () => {
    const result = await parseWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.getCell('A1').value = { formula: 'SUM(1,2)', result: 3 };
    });

    const cell = result.sheets[0].rows[0].cells[0];
    expect(cell.value).toBe(3);
    expect(cell.text).toBe('3');
  });

  it('concatenates rich text runs into plain text', async () => {
    const result = await parseWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.getCell('A1').value = {
        richText: [{ text: 'Hello ' }, { text: 'world' }],
      };
    });

    const cell = result.sheets[0].rows[0].cells[0];
    expect(cell.value).toBe('Hello world');
    expect(cell.text).toBe('Hello world');
  });

  it('renders a hyperlink cell using its display text', async () => {
    const result = await parseWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.getCell('A1').value = {
        text: 'Contact us',
        hyperlink: 'mailto:doku@example.com',
      };
    });

    const cell = result.sheets[0].rows[0].cells[0];
    expect(cell.value).toBe('Contact us');
    expect(cell.text).toBe('Contact us');
  });

  it('falls back to the raw URL for a hyperlink cell with no display text', () => {
    // A real-world shape confirmed against an actual file: a hyperlink cell
    // with no custom display text reads back as plain {hyperlink}, no
    // `text` key at all — Excel shows the URL itself in that case. Tested
    // directly rather than via a write+read round trip: exceljs's own
    // writer can't correctly serialize this exact shape (it string-coerces
    // the whole value instead of building real hyperlink XML when `text`
    // is missing), which would make the round trip test the writer's
    // limitation instead of our read-side unwrapping.
    expect(unwrapCellValue({ hyperlink: 'mailto:doku@example.com' })).toBe(
      'mailto:doku@example.com',
    );
  });

  it('falls back to the raw URL even when text is present but explicitly undefined', () => {
    // Regression test: a real exceljs-parsed hyperlink cell can carry a
    // `text` key whose value is `undefined` rather than omitting the key
    // entirely. `'text' in value` is true for that shape (this bit us:
    // `value.text` — undefined — got used as the display text instead of
    // falling back), so the fix has to check the value, not key presence.
    expect(
      unwrapCellValue({
        text: undefined,
        hyperlink: 'mailto:doku@example.com',
      }),
    ).toBe('mailto:doku@example.com');
  });

  it('renders an empty cell as null/empty text without crashing', async () => {
    const result = await parseWorkbook((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.getCell('B1').value = 'x'; // forces the row/column to exist
    });

    const cell = result.sheets[0].rows[0].cells[0]; // A1, never set
    expect(cell.value).toBeNull();
    expect(cell.text).toBe('');
  });

  describe('styles', () => {
    it('captures bold/italic/font color', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        const cell = sheet.getCell('A1');
        cell.value = 'x';
        cell.font = { bold: true, italic: true, color: { argb: 'FFFF0000' } };
      });

      const { styles, sheets } = result;
      const style = styles[sheets[0].rows[0].cells[0].styleId];

      expect(style.bold).toBe(true);
      expect(style.italic).toBe(true);
      expect(style.color).toBe('#ff0000');
    });

    it('uses fgColor as the visible color for a solid fill', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        const cell = sheet.getCell('A1');
        cell.value = 'x';
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF00FF00' },
          bgColor: { argb: 'FFFF0000' },
        };
      });

      const { styles, sheets } = result;
      const style = styles[sheets[0].rows[0].cells[0].styleId];

      expect(style.backgroundColor).toBe('#00ff00');
    });

    it('dedupes identical styles into one entry, shared by both cells', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        sheet.getCell('A1').value = 'x';
        sheet.getCell('A1').font = { bold: true };
        sheet.getCell('B1').value = 'y';
        sheet.getCell('B1').font = { bold: true };
        sheet.getCell('C1').value = 'z';
        sheet.getCell('C1').font = { bold: false };
      });

      const [row1] = result.sheets[0].rows;
      expect(row1.cells[0].styleId).toBe(row1.cells[1].styleId);
      expect(row1.cells[0].styleId).not.toBe(row1.cells[2].styleId);
      expect(result.styles.length).toBeLessThan(3);
    });

    it('clamps an exotic alignment to the nearest supported value', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        const cell = sheet.getCell('A1');
        cell.value = 'x';
        cell.alignment = { horizontal: 'justify', vertical: 'distributed' };
      });

      const style = result.styles[result.sheets[0].rows[0].cells[0].styleId];
      expect(style.align).toBe('left');
      expect(style.valign).toBe('bottom');
    });
  });

  describe('structure', () => {
    it('includes merges', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        sheet.getCell('A1').value = 'x';
        sheet.mergeCells('A1:B2');
      });

      expect(result.sheets[0].merges).toEqual([
        { row: 0, col: 0, rowSpan: 2, colSpan: 2 },
      ]);
    });

    it('marks a hidden row', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        sheet.getCell('A1').value = 'x';
        sheet.getRow(1).hidden = true;
      });

      expect(result.sheets[0].rows[0].hidden).toBe(true);
    });

    it('includes frozen panes', async () => {
      const result = await parseWorkbook((workbook) => {
        const sheet = workbook.addWorksheet('Sheet1');
        sheet.getCell('A1').value = 'x';
        sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
      });

      expect(result.sheets[0].frozen).toEqual({ rows: 1, cols: 1 });
    });
  });
});
