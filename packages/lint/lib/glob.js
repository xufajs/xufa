// Glob patterns of configs, as ESLint's flat config reads them (minimatch's syntax, with dot files matched): ** for
// any folders, * and ? within a name, {a,b} for either, [abc] for a character; a pattern that ends with / matches a
// folder and what it has; ! makes an ignore pattern take back what one before it ignored.

const cache = new Map();

function escape(char) {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

// A pattern as a regular expression of paths (with /, relative to the config's folder).
function compile(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  let source = '';
  let i = 0;
  let braces = 0;
  const text = pattern.replace(/^\.\//, '');
  while (i < text.length) {
    const char = text[i];
    if (char === '*') {
      if (text[i + 1] === '*') {
        const atStart = i === 0 || text[i - 1] === '/';
        const atEnd = i + 2 === text.length || text[i + 2] === '/';
        if (atStart && atEnd) {
          // **/ is any folders (none too); a final ** is anything.
          if (i + 2 === text.length) source += '.*';
          else {
            source += '(?:[^/]*/)*';
            i += 1;
          }
          i += 2;
          continue;
        }
      }
      source += '[^/]*';
      i += 1;
    } else if (char === '?') {
      source += '[^/]';
      i += 1;
    } else if (char === '[') {
      const close = text.indexOf(']', i + 1);
      if (close < 0) {
        source += '\\[';
        i += 1;
      } else {
        source += `[${text
          .slice(i + 1, close)
          .replace(/^!/, '^')
          .replace(/\\/g, '\\\\')}]`;
        i = close + 1;
      }
    } else if (char === '{') {
      braces += 1;
      source += '(?:';
      i += 1;
    } else if (char === '}' && braces > 0) {
      braces -= 1;
      source += ')';
      i += 1;
    } else if (char === ',' && braces > 0) {
      source += '|';
      i += 1;
    } else if (char === '\\' && i + 1 < text.length) {
      source += escape(text[i + 1]);
      i += 2;
    } else {
      source += escape(char);
      i += 1;
    }
  }
  const regex = new RegExp(`^${source}$`);
  cache.set(pattern, regex);
  return regex;
}

/** Whether `file` (relative, with /) matches `pattern`. */
function matches(pattern, file) {
  if (pattern.endsWith('/')) {
    // A folder: what is in it.
    const folder = compile(pattern.slice(0, -1));
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (folder.test(parts.slice(0, i).join('/'))) return true;
    }
    return false;
  }
  return compile(pattern).test(file);
}

/** Whether a list of ignore patterns ignores `file`: the last that matches decides (! takes back). */
function ignored(patterns, file) {
  let result = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (result && matches(pattern.slice(1), file)) result = false;
    } else if (!result && matches(pattern, file)) {
      result = true;
    }
  }
  return result;
}

export { matches, ignored, compile };
