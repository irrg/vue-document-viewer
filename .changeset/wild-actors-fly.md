---
'@irrg/vue-document-viewer': minor
---

Add find-in-document to PdfViewer (search/findNext/findPrevious/clearSearch), and fix several rendering correctness bugs surfaced while building it: a simpler general fix for the post-zoom stale-canvas-paint bug, duplicate text-layer spans accumulating across re-renders, a premature "page is ready" race, and a smooth-scroll race with window.find.
