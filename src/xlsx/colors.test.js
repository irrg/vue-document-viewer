import { describe, expect, it } from 'vitest';

import {
  applyTint,
  argbToHex,
  extractThemeColors,
  resolveColor,
  resolveIndexedColor,
} from './colors.js';

describe('argbToHex', () => {
  it('passes an opaque color straight through', () => {
    expect(argbToHex('FFFF0000')).toBe('#ff0000');
  });

  it('composites a semi-transparent color against white', () => {
    // alpha 0x80/255 ≈ 0.502; red channel stays saturated (255 either way),
    // green/blue move to 255 * (1 - 0.502) ≈ 127 (0x7f).
    const result = argbToHex('80FF0000');
    expect(result).toBe('#ff7f7f');
  });

  it('treats a fully transparent color as white', () => {
    expect(argbToHex('00FF0000')).toBe('#ffffff');
  });

  it('treats a bare 6-digit RGB as fully opaque', () => {
    expect(argbToHex('00FF00')).toBe('#00ff00');
  });
});

describe('applyTint', () => {
  it('returns the color unchanged for tint 0', () => {
    expect(applyTint('#4472c4', 0)).toBe('#4472c4');
  });

  it('fully lightens to white at tint 1, regardless of the base color', () => {
    expect(applyTint('#4472c4', 1)).toBe('#ffffff');
    expect(applyTint('#000000', 1)).toBe('#ffffff');
  });

  it('fully darkens to black at tint -1, regardless of the base color', () => {
    expect(applyTint('#4472c4', -1)).toBe('#000000');
    expect(applyTint('#ffffff', -1)).toBe('#000000');
  });

  it('lightens toward white for a positive tint', () => {
    const result = applyTint('#4472c4', 0.5);
    // Every channel should have moved toward 255 relative to the base.
    expect(parseInt(result.slice(1, 3), 16)).toBeGreaterThan(0x44);
    expect(parseInt(result.slice(3, 5), 16)).toBeGreaterThan(0x72);
    expect(parseInt(result.slice(5, 7), 16)).toBeGreaterThan(0xc4);
  });

  it('darkens toward black for a negative tint', () => {
    const result = applyTint('#4472c4', -0.5);
    expect(parseInt(result.slice(1, 3), 16)).toBeLessThan(0x44);
    expect(parseInt(result.slice(3, 5), 16)).toBeLessThan(0x72);
    expect(parseInt(result.slice(5, 7), 16)).toBeLessThan(0xc4);
  });

  it('does not throw on grayscale (zero-saturation) colors', () => {
    expect(() => applyTint('#808080', 0.3)).not.toThrow();
    expect(() => applyTint('#000000', -0.3)).not.toThrow();
  });
});

describe('resolveIndexedColor', () => {
  it('resolves a known legacy index', () => {
    expect(resolveIndexedColor(2)).toBe('#ff0000'); // red
  });

  it('resolves index 0 (black) without falling back', () => {
    expect(resolveIndexedColor(0)).toBe('#000000');
  });

  it('duplicates indices 0-7 at 8-15 for backward compatibility', () => {
    expect(resolveIndexedColor(8)).toBe(resolveIndexedColor(0));
  });

  it('degrades an out-of-range index to neutral gray instead of throwing', () => {
    expect(resolveIndexedColor(999)).toBe('#808080');
    expect(resolveIndexedColor(64)).toBe('#808080'); // "system foreground"
  });
});

describe('extractThemeColors', () => {
  it('returns the default Office theme when no XML is given', () => {
    const theme = extractThemeColors(undefined);
    expect(theme.accent1).toBe('4472c4');
    expect(theme.dk1).toBe('000000');
    expect(theme.lt1).toBe('ffffff');
  });

  it('extracts srgbClr swatches from real theme XML', () => {
    const xml = `<a:theme><a:themeElements><a:clrScheme name="Custom">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="112233"/></a:dk2>
      <a:lt2><a:srgbClr val="AABBCC"/></a:lt2>
      <a:accent1><a:srgbClr val="123456"/></a:accent1>
      <a:accent2><a:srgbClr val="234567"/></a:accent2>
      <a:accent3><a:srgbClr val="345678"/></a:accent3>
      <a:accent4><a:srgbClr val="456789"/></a:accent4>
      <a:accent5><a:srgbClr val="56789a"/></a:accent5>
      <a:accent6><a:srgbClr val="6789ab"/></a:accent6>
      <a:hlink><a:srgbClr val="0000ff"/></a:hlink>
      <a:folHlink><a:srgbClr val="ff00ff"/></a:folHlink>
    </a:clrScheme></a:themeElements></a:theme>`;

    const theme = extractThemeColors(xml);

    expect(theme.dk1).toBe('000000');
    expect(theme.lt1).toBe('ffffff');
    expect(theme.dk2).toBe('112233');
    expect(theme.lt2).toBe('aabbcc');
    expect(theme.accent1).toBe('123456');
    expect(theme.hlink).toBe('0000ff');
  });

  it('falls back to the default for a missing swatch without losing the rest', () => {
    const xml = `<a:clrScheme>
      <a:accent1><a:srgbClr val="123456"/></a:accent1>
    </a:clrScheme>`;

    const theme = extractThemeColors(xml);

    expect(theme.accent1).toBe('123456');
    expect(theme.accent2).toBe('ed7d31'); // default, since it wasn't present
  });

  it('falls back entirely on malformed XML', () => {
    expect(extractThemeColors('not xml at all')).toEqual(
      extractThemeColors(undefined),
    );
  });
});

describe('resolveColor', () => {
  const theme = extractThemeColors(undefined);

  it('returns the fallback for a missing color', () => {
    expect(resolveColor(null, theme, '#123456')).toBe('#123456');
    expect(resolveColor(undefined, theme)).toBeNull();
  });

  it('resolves an argb color', () => {
    expect(resolveColor({ argb: 'FF00FF00' }, theme)).toBe('#00ff00');
  });

  it('resolves a theme color, applying the lt1/dk1 index swap', () => {
    // Theme index 0 is lt1 (white in the default theme), not dk1 (black) —
    // this is the swap documented in colors.js.
    expect(resolveColor({ theme: 0 }, theme)).toBe('#ffffff');
    expect(resolveColor({ theme: 1 }, theme)).toBe('#000000');
  });

  it('resolves a theme color with a tint applied', () => {
    const plain = resolveColor({ theme: 4 }, theme); // accent1
    const tinted = resolveColor({ theme: 4, tint: 0.5 }, theme);

    expect(tinted).not.toBe(plain);
  });

  it('degrades an out-of-range theme index to neutral gray', () => {
    expect(resolveColor({ theme: 999 }, theme)).toBe('#808080');
  });

  it('resolves an indexed color', () => {
    expect(resolveColor({ indexed: 2 }, theme)).toBe('#ff0000');
  });

  it('prefers argb over theme/indexed if somehow multiple are present', () => {
    expect(resolveColor({ argb: 'FF00FF00', theme: 0 }, theme)).toBe('#00ff00');
  });
});
