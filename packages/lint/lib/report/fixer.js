// Fixes: what a rule's fix function makes with the fixer it gets ({ range, text }: the text that replaces a range of
// the source), and the fixes of one report merged into one.

class RuleFixer {
  #sourceCode;

  constructor({ sourceCode }) {
    this.#sourceCode = sourceCode;
  }

  insertTextAfter(nodeOrToken, text) {
    return this.insertTextAfterRange(this.#sourceCode.getRange(nodeOrToken), text);
  }

  insertTextAfterRange(range, text) {
    return { range: [range[1], range[1]], text };
  }

  insertTextBefore(nodeOrToken, text) {
    return this.insertTextBeforeRange(this.#sourceCode.getRange(nodeOrToken), text);
  }

  insertTextBeforeRange(range, text) {
    return { range: [range[0], range[0]], text };
  }

  replaceText(nodeOrToken, text) {
    return this.replaceTextRange(this.#sourceCode.getRange(nodeOrToken), text);
  }

  replaceTextRange(range, text) {
    return { range, text };
  }

  remove(nodeOrToken) {
    return this.removeRange(this.#sourceCode.getRange(nodeOrToken));
  }

  removeRange(range) {
    return { range, text: '' };
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const copyFix = (fix) => (fix ? { range: [fix.range[0], fix.range[1]], text: fix.text } : null);

function checkFix(fix) {
  if (fix) {
    check(
      fix.range && typeof fix.range[0] === 'number' && typeof fix.range[1] === 'number',
      `Fix has invalid range: ${JSON.stringify(fix, null, 2)}`
    );
  }
}

// Fixes of a report, in the order of their ranges (not overlapping), as one fix of the text from the first to the last.
function mergeFixes(fixes, sourceCode) {
  fixes.forEach(checkFix);
  if (fixes.length === 0) return null;
  if (fixes.length === 1) return copyFix(fixes[0]);
  fixes.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
  const { text: original } = sourceCode;
  const start = fixes[0].range[0];
  const end = fixes.at(-1).range[1];
  let text = '';
  let lastPos = Number.MIN_SAFE_INTEGER;
  for (const fix of fixes) {
    check(fix.range[0] >= lastPos, 'Fix objects must not be overlapped in a report.');
    if (fix.range[0] >= 0) text += original.slice(Math.max(0, start, lastPos), fix.range[0]);
    text += fix.text;
    lastPos = fix.range[1];
  }
  text += original.slice(Math.max(0, start, lastPos), end);
  return { range: [start, end], text };
}

/** The fix of a report or a suggestion (its `fix` function called with a fixer: a fix, or fixes to merge), or null. */
function fixOf(descriptor, sourceCode) {
  if (typeof descriptor.fix !== 'function') return null;
  const fix = descriptor.fix(new RuleFixer({ sourceCode }));
  if (fix && Symbol.iterator in fix) return mergeFixes(Array.from(fix), sourceCode);
  checkFix(fix);
  return copyFix(fix);
}

export { RuleFixer, fixOf };
