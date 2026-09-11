---
'@irrg/vue-document-viewer': minor
---

Add XlsxViewer: virtualized DOM table rendering with sheet tabs, merges, frozen panes, and a row cap. Fixes two real bugs found while wiring it up: PdfViewer never actually terminated its pdf.js worker on unmount (it called destroy() on the wrong object), and the adapter mishandled hyperlink cells whose display text is absent or explicitly undefined.
