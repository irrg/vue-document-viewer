import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPdfSearch } from './pdfSearch.js';

const buildPageEl = (index) => {
  const pageEl = document.createElement('div');
  pageEl.dataset.pageIndex = String(index);

  const textLayer = document.createElement('div');
  textLayer.className = 'pdf-page__text-layer';

  const span = document.createElement('span');
  span.textContent = `page ${index} text`;
  textLayer.append(span);

  pageEl.append(textLayer);
  pageEl.scrollIntoView = vi.fn();
  document.body.append(pageEl);

  return pageEl;
};

const selectOnPage = (pageEl) => {
  const span = pageEl.querySelector('span');
  const range = document.createRange();
  range.selectNodeContents(span);

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const fakePage = (text) => ({
  getTextContent: () => Promise.resolve({ items: [{ str: text }] }),
});

describe('createPdfSearch', () => {
  let pageEls;
  let pages;
  let rendered;
  let search;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection().removeAllRanges();

    pageEls = new Map();
    pages = [
      fakePage('the quick brown fox'),
      fakePage('jumps over the lazy dog'),
      fakePage('the quick fox again'),
    ];
    rendered = new Set([0, 1, 2]);

    pages.forEach((_, index) => pageEls.set(index, buildPageEl(index)));

    search = createPdfSearch({
      getPages: () => pages,
      getPageEl: (index) => pageEls.get(index),
      isPageRendered: (index) => rendered.has(index),
      waitForPageRendered: () => Promise.resolve(),
      isPageActive: (index) => rendered.has(index),
      markPageStale: (index) => rendered.delete(index),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.find;
  });

  it('reports no matches for an empty query without touching window.find', async () => {
    window.find = vi.fn();

    const result = await search.search('');

    expect(result).toEqual({ found: false, total: 0, position: 0 });
    expect(window.find).not.toHaveBeenCalled();
  });

  it('reports no matches when the text appears on no page', async () => {
    window.find = vi.fn();

    const result = await search.search('nonexistent');

    expect(result).toEqual({ found: false, total: 0, position: 0 });
  });

  it('jumps to and reports the first matching page', async () => {
    window.find = vi.fn().mockReturnValue(true);

    const result = await search.search('quick');

    expect(result.found).toBe(true);
    expect(result.total).toBe(2); // pages 0 and 2 both contain "quick"
    expect(result.position).toBe(1);
    expect(result.pageIndex).toBe(0);
  });

  it('never returns a NaN pageIndex from the same-page fast path', async () => {
    // Regression test: stepMatch's fast path (window.find succeeds without
    // needing a page jump) used to omit pageIndex entirely, so the caller's
    // `pageIndex + 1` display came out NaN.
    window.find = vi.fn().mockReturnValue(true);
    await search.search('quick');
    selectOnPage(pageEls.get(0)); // simulate window.find landing on page 0 again

    const result = await search.findNext();

    expect(result.pageIndex).toBe(0);
    expect(Number.isNaN(result.pageIndex)).toBe(false);
  });

  it('falls back to the next matching page once window.find is exhausted', async () => {
    window.find = vi
      .fn()
      // search(): jump to page 0
      .mockReturnValueOnce(true)
      // findNext(): fast path exhausted on page 0
      .mockReturnValueOnce(false)
      // findNext(): jumpToPage(2) succeeds
      .mockReturnValueOnce(true);

    await search.search('quick');
    const result = await search.findNext();

    expect(result.found).toBe(true);
    expect(result.position).toBe(2);
    expect(result.pageIndex).toBe(2);
    expect(pageEls.get(2).scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
    });
  });

  it('wraps from the last matching page back to the first on findNext', async () => {
    window.find = vi
      .fn()
      .mockReturnValueOnce(true) // search() -> page 0
      .mockReturnValueOnce(false) // findNext #1 fast path fails
      .mockReturnValueOnce(true) // findNext #1 jump to page 2 succeeds
      .mockReturnValueOnce(false) // findNext #2 fast path fails
      .mockReturnValueOnce(true); // findNext #2 wraps to page 0

    await search.search('quick');
    await search.findNext();
    const wrapped = await search.findNext();

    expect(wrapped.position).toBe(1);
    expect(wrapped.pageIndex).toBe(0);
  });

  it('wraps from the first matching page back to the last on findPrevious', async () => {
    window.find = vi
      .fn()
      .mockReturnValueOnce(true) // search() -> page 0
      .mockReturnValueOnce(false) // findPrevious fast path fails
      .mockReturnValueOnce(true); // jump to last match (page 2)

    await search.search('quick');
    const result = await search.findPrevious();

    expect(result.position).toBe(2);
    expect(result.pageIndex).toBe(2);
  });

  it("reports found: false when a page jump still can't find the text", async () => {
    window.find = vi
      .fn()
      .mockReturnValueOnce(true) // search() -> page 0
      .mockReturnValueOnce(false) // findNext fast path fails
      .mockReturnValueOnce(false); // jump to page 2 also fails

    await search.search('quick');
    const result = await search.findNext();

    expect(result.found).toBe(false);
    expect(result.pageIndex).toBe(2); // still reports where it looked
  });

  it('clears state so a subsequent findNext reports no matches', async () => {
    window.find = vi.fn().mockReturnValue(true);
    await search.search('quick');

    search.clearSearch();
    const result = await search.findNext();

    expect(result).toEqual({ found: false, total: 0, position: 0 });
  });

  it('caches page text so a second search does not re-read page content', async () => {
    window.find = vi.fn().mockReturnValue(true);
    const getTextContentSpy = vi.spyOn(pages[0], 'getTextContent');

    await search.search('quick');
    await search.search('fox');

    expect(getTextContentSpy).toHaveBeenCalledTimes(1);
  });

  describe('reanchorCurrentMatch', () => {
    it('does nothing without an active search', async () => {
      window.find = vi.fn();

      await search.reanchorCurrentMatch();

      expect(window.find).not.toHaveBeenCalled();
    });

    it('does nothing when the current match page is not active', async () => {
      window.find = vi.fn().mockReturnValue(true);
      await search.search('quick');
      rendered.clear(); // page 0 is no longer active

      await search.reanchorCurrentMatch();

      expect(window.find).toHaveBeenCalledTimes(1); // only from search()
    });

    it('re-focuses and re-finds the current match page when it is active', async () => {
      window.find = vi.fn().mockReturnValue(true);
      await search.search('quick');
      rendered.add(0);

      await search.reanchorCurrentMatch();

      expect(window.find).toHaveBeenCalledTimes(2);
    });
  });
});
