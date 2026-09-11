/**
 * Excel/OOXML color resolution: the three encodings a cell color can arrive
 * in (ARGB, theme+tint, indexed). See ECMA-376 Part 1 §18.8.3 (CT_Color) and
 * §20.1.6.2 (clrScheme).
 */

// ECMA-376's clrScheme declares its 12 swatches as dk1, lt1, dk2, lt2,
// accent1-6, hlink, folHlink, in that order — but the numeric `theme` index
// used by a cell's <color theme="N"/> does NOT follow that declaration
// order. Excel swaps dk1/lt1 and dk2/lt2, so index 0 is lt1, not dk1. This
// is a well-documented gotcha (see SheetJS/sheetjs#389, where picking "lt1"
// in Excel's own UI writes theme="0") confirmed against openpyxl's
// production theme-resolution order.
const THEME_INDEX_SLOTS = [
  'lt1',
  'dk1',
  'lt2',
  'dk2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
];

// The modern default "Office" theme, used whenever a workbook's theme XML
// is missing, unparseable, or missing a swatch.
const DEFAULT_THEME = {
  dk1: '000000',
  lt1: 'ffffff',
  dk2: '44546a',
  lt2: 'e7e6e6',
  accent1: '4472c4',
  accent2: 'ed7d31',
  accent3: 'a5a5a5',
  accent4: 'ffc000',
  accent5: '5b9bd5',
  accent6: '70ad47',
  hlink: '0563c1',
  folHlink: '954f72',
};

const NEUTRAL_GRAY = '808080';

// The legacy 64-entry indexed palette (ECMA-376 §18.8.27, indexedColors).
// Indices 0-7 duplicate 8-15 intentionally, preserved from the original
// 8-color EGA-era palette for backward compatibility.
const INDEXED_COLORS = [
  '000000',
  'ffffff',
  'ff0000',
  '00ff00',
  '0000ff',
  'ffff00',
  'ff00ff',
  '00ffff',
  '000000',
  'ffffff',
  'ff0000',
  '00ff00',
  '0000ff',
  'ffff00',
  'ff00ff',
  '00ffff',
  '800000',
  '008000',
  '000080',
  '808000',
  '800080',
  '008080',
  'c0c0c0',
  '808080',
  '9999ff',
  '993366',
  'ffffcc',
  'ccffff',
  '660066',
  'ff8080',
  '0066cc',
  'ccccff',
  '000080',
  'ff00ff',
  'ffff00',
  '00ffff',
  '800080',
  '800000',
  '008080',
  '0000ff',
  '00ccff',
  'ccffff',
  'ccffcc',
  'ffff99',
  '99ccff',
  'ff99cc',
  'cc99ff',
  'ffcc99',
  '3366ff',
  '33cccc',
  '99cc00',
  'ffcc00',
  'ff9900',
  'ff6600',
  '666699',
  '969696',
  '003366',
  '339966',
  '003300',
  '333300',
  '993300',
  '993366',
  '333399',
  '333333',
];

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));

const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

const hexToRgb = (hex) => {
  const clean = hex.replace(/^#/, '');

  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

/**
 * @param {string} argb - Alpha-first hex, e.g. 'FFRRGGBB' (or bare 'RRGGBB',
 * treated as fully opaque).
 * @returns {string} '#rrggbb', with any alpha composited against white.
 */
export const argbToHex = (argb) => {
  const clean = String(argb).replace(/^#/, '').toLowerCase();
  const hasAlpha = clean.length === 8;
  const a = hasAlpha ? parseInt(clean.slice(0, 2), 16) / 255 : 1;
  const rgbHex = hasAlpha ? clean.slice(2) : clean.padStart(6, '0');
  const { r, g, b } = hexToRgb(rgbHex);

  return toHex({
    r: clampByte(r * a + 255 * (1 - a)),
    g: clampByte(g * a + 255 * (1 - a)),
    b: clampByte(b * a + 255 * (1 - a)),
  });
};

const rgbToHsl = ({ r, g, b }) => {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;

  if (max === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6;
  else if (max === gN) h = ((bN - rN) / d + 2) / 6;
  else h = ((rN - gN) / d + 4) / 6;

  return { h, s, l };
};

const hueToChannel = (p, q, tIn) => {
  let t = tIn;

  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

  return p;
};

const hslToRgb = ({ h, s, l }) => {
  if (s === 0) {
    const v = clampByte(l * 255);
    return { r: v, g: v, b: v };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clampByte(hueToChannel(p, q, h + 1 / 3) * 255),
    g: clampByte(hueToChannel(p, q, h) * 255),
    b: clampByte(hueToChannel(p, q, h - 1 / 3) * 255),
  };
};

/**
 * Applies an ECMA-376 CT_Color `tint` in [-1, 1]. Negative tints darken
 * (scale lightness down); positive tints lighten (scale toward white).
 * @param {string} hex - '#rrggbb'
 * @param {number} tint
 * @returns {string} '#rrggbb'
 */
export const applyTint = (hex, tint) => {
  if (!tint) return hex;

  const hsl = rgbToHsl(hexToRgb(hex));
  const l = tint < 0 ? hsl.l * (1 + tint) : hsl.l * (1 - tint) + tint;

  return toHex(hslToRgb({ ...hsl, l }));
};

/**
 * @param {number} index
 * @returns {string} '#rrggbb'. Indices 64/65 (system foreground/background)
 * and anything out of range degrade to a neutral gray rather than throw —
 * there's no context-free correct answer for a system color.
 */
export const resolveIndexedColor = (index) =>
  `#${INDEXED_COLORS[index] ?? NEUTRAL_GRAY}`;

const extractSwatch = (slotXml) => {
  const srgb = slotXml.match(/<a:srgbClr val="([0-9a-fA-F]{6})"/);
  if (srgb) return srgb[1].toLowerCase();

  const sysClr = slotXml.match(/<a:sysClr[^>]*lastClr="([0-9a-fA-F]{6})"/);
  return sysClr ? sysClr[1].toLowerCase() : null;
};

/**
 * Extracts the 12 clrScheme swatches from a workbook's raw theme XML —
 * exceljs exposes this unparsed as `workbook.model.themes.theme1`, since it
 * only keeps it around for round-tripping on write. Falls back to the
 * default Office theme wherever a swatch is missing, malformed, or the
 * whole document is absent/unparseable.
 * @param {string|undefined} themeXml
 * @returns {Record<string, string>} slot name (dk1, lt1, ...) -> hex, no '#'
 */
export const extractThemeColors = (themeXml) => {
  const scheme = { ...DEFAULT_THEME };
  if (!themeXml) return scheme;

  const schemeMatch = themeXml.match(
    /<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/,
  );
  if (!schemeMatch) return scheme;

  const body = schemeMatch[1];

  Object.keys(DEFAULT_THEME).forEach((slot) => {
    const slotMatch = body.match(
      new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`),
    );
    if (!slotMatch) return;

    const swatch = extractSwatch(slotMatch[1]);
    if (swatch) scheme[slot] = swatch;
  });

  return scheme;
};

/**
 * Resolves any of the three CT_Color encodings into a display color.
 * @param {{argb?: string, theme?: number, tint?: number, indexed?: number}|null|undefined} color
 * @param {Record<string, string>} themeColors - from extractThemeColors()
 * @param {string|null} [fallback] - used when `color` is absent entirely
 * @returns {string|null} '#rrggbb', or `fallback` if there's nothing to resolve
 */
export const resolveColor = (color, themeColors, fallback = null) => {
  if (!color) return fallback;

  if (color.argb) return argbToHex(color.argb);

  if (color.theme !== undefined) {
    const slot = THEME_INDEX_SLOTS[color.theme];
    const base = slot ? themeColors[slot] : undefined;

    return base ? applyTint(`#${base}`, color.tint ?? 0) : `#${NEUTRAL_GRAY}`;
  }

  if (color.indexed !== undefined) return resolveIndexedColor(color.indexed);

  return fallback;
};
