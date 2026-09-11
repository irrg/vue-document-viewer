/**
 * Resolves the shared `src` prop into a `Uint8Array`. Every viewer accepts
 * the same four input shapes, so this is the one place that decides how.
 */
const toUint8Array = async (src) => {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());

  throw new TypeError(
    'Unsupported src: expected ArrayBuffer, Uint8Array, Blob, or a URL string.',
  );
};

const defaultFetcher = (url) =>
  fetch(url).then((response) => response.arrayBuffer());

/**
 * @param {ArrayBuffer|Uint8Array|Blob|string} src
 * @param {(url: string) => Promise<ArrayBuffer>} [fetcher]
 * @returns {Promise<Uint8Array>}
 */
export const loadSourceBytes = async (src, fetcher = defaultFetcher) => {
  if (typeof src === 'string') return toUint8Array(await fetcher(src));

  return toUint8Array(src);
};
