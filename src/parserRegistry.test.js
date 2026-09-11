import { describe, expect, it } from 'vitest';

import { DocumentFormat } from './detectFormat.js';
import { getWorkbookParser, registerWorkbookParser } from './parserRegistry.js';

describe('parserRegistry', () => {
  it('returns undefined for an unregistered format', () => {
    expect(getWorkbookParser('made-up-format')).toBeUndefined();
  });

  it('returns the loader it was given for its format', () => {
    const loader = () => Promise.resolve({ parse: () => {} });

    registerWorkbookParser('test-format', loader);

    expect(getWorkbookParser('test-format')).toBe(loader);
  });

  it('leaves legacy formats unregistered — a missing parser is the signal to fall back, not an error', () => {
    expect(() => getWorkbookParser(DocumentFormat.LegacyOle)).not.toThrow();
    expect(getWorkbookParser(DocumentFormat.LegacyOle)).toBeUndefined();
    expect(getWorkbookParser(DocumentFormat.Rtf)).toBeUndefined();
    expect(getWorkbookParser(DocumentFormat.Unknown)).toBeUndefined();
  });
});
