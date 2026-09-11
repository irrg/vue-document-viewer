/**
 * Find-in-document for PdfViewer, factored out of the component so it can
 * be unit tested without a real pdfjs worker or canvas — this is plain DOM
 * + Selection logic, nothing pdf.js-specific.
 *
 * Virtualization only keeps nearby pages mounted, but a match can be
 * anywhere, so this needs its own page-indexed text index (`ensurePageTexts`)
 * independent of what's currently on screen. The actual highlight/scroll is
 * the browser's own `window.find`, which is precise and free once real text
 * exists in the DOM — our job is knowing which page to reveal so it does.
 *
 * @param {object} deps
 * @param {() => object[]} deps.getPages - Current PDFPageProxy list.
 * @param {(index: number) => Element|undefined} deps.getPageEl - A page's
 *   root element, keyed by page index.
 * @param {(index: number) => boolean} deps.isPageRendered - Whether a page's
 *   text layer is fully populated right now (not just mounted/streaming).
 * @param {(index: number) => Promise<void>} deps.waitForPageRendered -
 *   Resolves once that page's next render completes.
 * @param {(index: number) => boolean} deps.isPageActive - Whether a page is
 *   currently mounted by virtualization.
 * @param {(index: number) => void} deps.markPageStale - Forget that a page
 *   was rendered, e.g. because a scale change is about to redo it.
 */
export const createPdfSearch = ({
  getPages,
  getPageEl,
  isPageRendered,
  waitForPageRendered,
  isPageActive,
  markPageStale,
}) => {
  let pageTexts = null;
  let query = '';
  let matchPageIndexes = [];
  let matchPointer = -1;

  const ensurePageTexts = async () => {
    if (pageTexts) return pageTexts;

    const contents = await Promise.all(
      getPages().map((page) => page.getTextContent()),
    );

    pageTexts = contents.map((content) =>
      content.items.map((item) => item.str).join(' '),
    );

    return pageTexts;
  };

  const focusStartOfPage = (index) => {
    const textLayerEl = getPageEl(index)?.querySelector(
      '.pdf-page__text-layer',
    );
    if (!textLayerEl) return;

    const range = document.createRange();
    range.setStart(textLayerEl, 0);
    range.collapse(true);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  // The page a match landed on after `window.find` — read from the live
  // selection rather than tracked bookkeeping, since a same-page hit (the
  // `stepMatch` fast path below) never goes through `jumpToPage` at all.
  const currentPageIndex = () => {
    const anchor = window.getSelection()?.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
    const pageEl = anchorEl?.closest('[data-page-index]');

    return pageEl ? Number(pageEl.dataset.pageIndex) : null;
  };

  // window.find's own "scroll the match into view" doesn't reliably reach
  // through our layout (absolutely-positioned spans inside an `overflow:
  // clip` text-layer div) — take explicit control instead of hoping it
  // scrolls correctly.
  const scrollMatchIntoView = () => {
    const anchor = window.getSelection()?.anchorNode;
    const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
    anchorEl?.scrollIntoView({ block: 'center' });
  };

  const nativeFind = (backwards = false) => {
    const found = window.find(query, false, backwards);
    if (found) scrollMatchIntoView();
    return found;
  };

  const jumpToPage = async (index) => {
    // Instant, not smooth: an in-flight scroll animation races with the
    // find call below and can make it miss text that's really there.
    getPageEl(index)?.scrollIntoView({ block: 'start' });
    if (!isPageRendered(index)) await waitForPageRendered(index);
    focusStartOfPage(index);
    return nativeFind();
  };

  const noMatches = () => ({ found: false, total: 0, position: 0 });

  const search = async (text) => {
    query = text;
    matchPointer = -1;

    if (!text) {
      matchPageIndexes = [];
      return noMatches();
    }

    const texts = await ensurePageTexts();
    const lower = text.toLowerCase();

    matchPageIndexes = texts
      .map((pageText, index) =>
        pageText.toLowerCase().includes(lower) ? index : -1,
      )
      .filter((index) => index !== -1);

    if (matchPageIndexes.length === 0) return noMatches();

    matchPointer = 0;
    const found = await jumpToPage(matchPageIndexes[0]);

    return {
      found,
      total: matchPageIndexes.length,
      position: 1,
      pageIndex: currentPageIndex() ?? matchPageIndexes[0],
    };
  };

  const stepMatch = async (direction) => {
    if (!query || matchPageIndexes.length === 0) return noMatches();

    // Multiple hits on an already-mounted page (or a few already-mounted
    // pages ahead, thanks to the virtualization buffer) resolve here without
    // needing a page jump at all.
    if (nativeFind(direction < 0)) {
      return {
        found: true,
        total: matchPageIndexes.length,
        position: matchPointer + 1,
        pageIndex: currentPageIndex(),
      };
    }

    matchPointer =
      (matchPointer + direction + matchPageIndexes.length) %
      matchPageIndexes.length;

    const pageIndex = matchPageIndexes[matchPointer];
    const found = await jumpToPage(pageIndex);

    return {
      found,
      total: matchPageIndexes.length,
      position: matchPointer + 1,
      pageIndex: currentPageIndex() ?? pageIndex,
    };
  };

  const findNext = () => stepMatch(1);
  const findPrevious = () => stepMatch(-1);

  const clearSearch = () => {
    query = '';
    matchPageIndexes = [];
    matchPointer = -1;
    window.getSelection()?.removeAllRanges();
  };

  // A scale change makes every active page re-render, which clears and
  // rebuilds its text-layer spans. If the current match's selection anchor
  // was one of those spans, the browser silently collapses it — leaving
  // `findNext` to resume from nowhere. Re-anchor to the current match's page
  // once it finishes re-rendering at the new scale.
  const reanchorCurrentMatch = async () => {
    if (!query || matchPointer < 0) return;

    const pageIndex = matchPageIndexes[matchPointer];
    if (!isPageActive(pageIndex)) return;

    markPageStale(pageIndex);
    await waitForPageRendered(pageIndex);
    focusStartOfPage(pageIndex);
    nativeFind();
  };

  return { search, findNext, findPrevious, clearSearch, reanchorCurrentMatch };
};
