import { describe, expect, it, vi } from 'vitest';

import { loadSourceBytes } from './loadSourceBytes.js';

describe('loadSourceBytes', () => {
  it('passes a Uint8Array through unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(await loadSourceBytes(bytes)).toBe(bytes);
  });

  it('wraps an ArrayBuffer', async () => {
    const { buffer } = new Uint8Array([1, 2, 3]);
    const result = await loadSourceBytes(buffer);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it('reads a Blob', async () => {
    const blob = new Blob([new Uint8Array([4, 5, 6])]);
    const result = await loadSourceBytes(blob);

    expect(Array.from(result)).toEqual([4, 5, 6]);
  });

  it('fetches a string URL with the given fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9]).buffer);

    const result = await loadSourceBytes('https://example.com/f.pdf', fetcher);

    expect(fetcher).toHaveBeenCalledWith('https://example.com/f.pdf');
    expect(Array.from(result)).toEqual([7, 8, 9]);
  });

  it('rejects an unsupported src type', async () => {
    await expect(loadSourceBytes(42)).rejects.toThrow(TypeError);
  });
});
