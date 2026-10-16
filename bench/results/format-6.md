# The formatter of @xufa/lint: speed after C1 (format-6, refactor step A4, first pass)

2026-10-13, 20:11 to 20:57, Windows 11, Intel Core i7-13700H, Node.js 24.21. The machine was busy (a warm round of
the repository's JavaScript took 3.6 s, then up to 7 s): only the best of many rounds, in processes taking turns
(`ab.mjs`: 5 to 7 pairs), told anything, and only above about 1%.

Where a warm round of JavaScript goes (CPU profile of the bundle, 5 rounds): the doc printer 17%
(printDocToString 7.6%, fits 5.1%, propagateBreaks 3.9%), the garbage collector 5.4%, the conversion to ESTree 3.9%,
TypeScript's scanner 2.5%, the printing of nodes (mainPrintInternal, callPluginPrintFunction, print, mainPrint) about
8%, getOrInsertComputed 1.8%. In the doc printer the time is the walk itself: the hottest line of each of the three is
the first test of the doc taken from the stack.

| Change | Exact | Best | Median | Kept |
| --- | --- | ---: | ---: | --- |
| fits(): the printed length of fills looked up on fills only (on arrays it is never there, and the lookup misses) | yes | 1.012x | 1.011x | yes |
| propagateBreaks(): strings not pushed on its stack | yes | 0.996x | (noise) | no |
| The printed doc of a node on the node (a symbol), not in a Map | yes | 1.029x | 0.950x | no (not shown faster) |
| print() without its check of prettier-ignore (callPluginPrintFunction() made it) | **no**: 1 file of the repository and 21 of the corpus differ | | | no |

So far: 1% on JavaScript. The doc printer's walks and prettier's printing of nodes are what is spent, spread thin;
what is left to try is larger: break propagation done while docs are built instead of in a walk of its own, the
widths of flat groups kept between fits() calls, the caches of getOrInsertComputed() as fields of nodes. To measure on
a quiet machine.
