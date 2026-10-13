// TypeScript's parser as @xufa/lint has it (typescript.cjs, by scripts/build-typescript.mjs; imported as #typescript),
// and the SourceFile of a file parsed once for the linter and the formatter: the linter keeps the last it makes, and the
// formatter takes it for the same text, instead of parsing it again (xufa-check lints a file, then formats it).
//
// The formatter makes JavaScript a module (externalModuleIndicator), which the linter leaves to TypeScript (an import
// or an export): in a module, TypeScript parses again the statements with `await`. A SourceFile the linter made of a
// script is the formatter's module when its text has no `await`.

import ts from './typescript.cjs';

let kept = null;

/** Keeps the SourceFile the linter made of `text` (TypeScript set its module indicator), for takeSourceFile(). */
function keepSourceFile(source, text) {
  kept = { source, text };
}

/**
 * The SourceFile kept for `text` of this kind (ts.ScriptKind), given once, or null. module: whether the formatter
 * makes it a module.
 */
function takeSourceFile(text, kind, module) {
  if (kept === null || kept.text !== text) return null;
  const { source } = kept;
  kept = null;
  if (source.scriptKind !== kind) return null;
  if (module && !source.externalModuleIndicator) {
    if (text.includes('await')) return null;
    source.externalModuleIndicator = true;
  }
  return source;
}

export default ts;
export { keepSourceFile, takeSourceFile };
