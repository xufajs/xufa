// Whether a regular expression can backtrack catastrophically: a quantified group holding another quantifier, like
// (a+)+ or (x*)*, has a star height above one. What safe-regex checks, without its limit on repetitions.

const RANGE = /^\{(?:\d+,\d*|\d*[2-9]\d*)\}/;

const isQuantifier = (source, i) => {
  const ch = source[i];
  if (ch === '*' || ch === '+') return true;
  if (ch === '?') return false;
  // {n,}, {n,m} and {n} with n > 1 repeat
  if (ch === '{') return RANGE.test(source.slice(i, i + 24));
  return false;
};

function isSafeRegex(regex) {
  const source = regex instanceof RegExp ? regex.source : String(regex);
  // Each open group remembers whether a quantifier was seen inside it.
  const stack = [{ quantified: false }];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\') {
      i += 1;
      if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      continue;
    }
    if (inClass) {
      if (ch === ']') {
        inClass = false;
        if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      }
      continue;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      stack.push({ quantified: false });
    } else if (ch === ')') {
      const group = stack.length > 1 ? stack.pop() : { quantified: false };
      if (isQuantifier(source, i + 1)) {
        if (group.quantified) return false;
        stack[stack.length - 1].quantified = true;
      } else if (group.quantified) {
        stack[stack.length - 1].quantified = true;
      }
    } else if (isQuantifier(source, i)) {
      stack[stack.length - 1].quantified = true;
    }
  }
  return true;
}

export { isSafeRegex };
