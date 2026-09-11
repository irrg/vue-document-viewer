# @irrg/vue-document-viewer

## 0.1.0

### Minor Changes

- b531698: Add XlsxViewer: virtualized DOM table rendering with sheet tabs, merges, frozen panes, and a row cap. Fixes two real bugs found while wiring it up: PdfViewer never actually terminated its pdf.js worker on unmount (it called destroy() on the wrong object), and the adapter mishandled hyperlink cells whose display text is absent or explicitly undefined.
- 24b6034: Add Excel color resolution (ARGB, theme+tint, indexed) as the first piece of the normalized-model decoder.
- 2be9ca2: Add embedded-image extraction (EMU anchor math) to the normalized-model decoder.
- d8da175: Add format detection, the workbook parser registry, and the fallback preview component.
- 3bf831d: Add Excel worksheet structure extraction (column widths, row heights, merges, frozen panes) to the normalized-model decoder.
- f74d985: Add PdfViewer: pdfjs-dist rendering with a selectable text layer, page virtualization, and devicePixelRatio-correct zoom.
- e351b08: Add Excel number-format rendering (percentages, thousands separators, fixed decimals, currency, dates/times) to the normalized-model decoder.
- dccbddf: Add find-in-document to PdfViewer (search/findNext/findPrevious/clearSearch), and fix several rendering correctness bugs surfaced while building it: a simpler general fix for the post-zoom stale-canvas-paint bug, duplicate text-layer spans accumulating across re-renders, a premature "page is ready" race, and a smooth-scroll race with window.find.
