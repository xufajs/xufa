// The fixes of problems applied to a text: in the order of their ranges, each that does not overlap one applied
// before it (those that do stay as problems, for the next pass); a byte order mark kept, unless a fix of the start
// removes or replaces it.
//
//   applyFixes(text, problems, shouldFix) -> { fixed, messages: the problems left, output }
//
// shouldFix: false applies none; a function, those it accepts.

const BOM = '﻿';

const byFixRange = (a, b) => a.fix.range[0] - b.fix.range[0] || a.fix.range[1] - b.fix.range[1];
const byLocation = (a, b) => a.line - b.line || a.column - b.column;

function applyFixes(sourceText, messages, shouldFix) {
  if (shouldFix === false) return { fixed: false, messages, output: sourceText };
  const bom = sourceText.startsWith(BOM) ? BOM : '';
  const text = bom ? sourceText.slice(1) : sourceText;
  const remaining = [];
  const fixes = [];
  for (const problem of messages) {
    if (Object.hasOwn(problem, 'fix') && problem.fix) fixes.push(problem);
    else remaining.push(problem);
  }
  if (!fixes.length) return { fixed: false, messages, output: bom + text };
  let output = bom;
  let lastPos = Number.NEGATIVE_INFINITY;
  let fixed = false;
  for (const problem of fixes.sort(byFixRange)) {
    if (typeof shouldFix === 'function' && !shouldFix(problem)) {
      remaining.push(problem);
      continue;
    }
    fixed = true;
    const { range, text: replacement } = problem.fix;
    const [start, end] = range;
    if (lastPos >= start || start > end) {
      remaining.push(problem);
      continue;
    }
    // A fix of the start that replaces the byte order mark (or a range before 0) drops it.
    if ((start < 0 && end >= 0) || (start === 0 && replacement.startsWith(BOM))) output = '';
    output += text.slice(Math.max(0, lastPos), Math.max(0, start)) + replacement;
    lastPos = end;
  }
  output += text.slice(Math.max(0, lastPos));
  return { fixed, messages: remaining.sort(byLocation), output };
}

export { applyFixes };
