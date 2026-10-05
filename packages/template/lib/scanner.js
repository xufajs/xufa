// The parts of a template: texts and tags. A tag is {{ expression }} (escaped), {{{ expression }}} (as it is),
// {{#if}}, {{else}}, {{/if}} and the other blocks, {{> partial}} or {{! comment }} ({{!-- comment --}} can hold }}).
// {{~ and ~}} take out the white space before and after a tag; \{{ is the text {{.
const { TemplateError } = require('./errors');

// The end of the expression that starts at `i`: where `close` is, out of strings and braces.
function endOf(source, i, close, name, tag = i) {
  let depth = 0;
  let j = i;
  while (j < source.length) {
    const char = source[j];
    if (char === '"' || char === "'") {
      j = skipString(source, j, name);
      continue;
    }
    if (char === '`') {
      j = skipTemplate(source, j, name);
      continue;
    }
    if (depth === 0 && (source.startsWith(close, j) || source.startsWith(`~${close}`, j))) return j;
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    j += 1;
  }
  throw new TemplateError(`Unclosed tag (expected ${close})`, { source, position: tag, name });
}

function skipString(source, i, name) {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length && source[j] !== quote) {
    if (source[j] === '\\') j += 1;
    else if (source[j] === '\n') break;
    j += 1;
  }
  if (source[j] !== quote) throw new TemplateError('Unterminated string', { source, position: i, name });
  return j + 1;
}

function skipTemplate(source, i, name) {
  let j = i + 1;
  while (j < source.length && source[j] !== '`') {
    if (source[j] === '\\') j += 2;
    else if (source[j] === '$' && source[j + 1] === '{') {
      j = endOf(source, j + 2, '}', name) + 1;
    } else j += 1;
  }
  if (source[j] !== '`') throw new TemplateError('Unterminated template literal', { source, position: i, name });
  return j + 1;
}

// Texts and tags, in order. A tag: { kind, body (its text, trimmed), start (of its body), position (of {{) }.
function scan(source, name) {
  const parts = [];
  let text = '';
  let i = 0;
  let trimNext = false;
  const pushText = () => {
    if (text) parts.push({ kind: 'text', text });
    text = '';
  };
  while (i < source.length) {
    const open = source.indexOf('{{', i);
    if (open === -1) {
      text += source.slice(i);
      break;
    }
    // \{{: the text {{.
    if (open > 0 && source[open - 1] === '\\') {
      text += `${source.slice(i, open - 1)}{{`;
      i = open + 2;
      continue;
    }
    text += source.slice(i, open);
    if (trimNext) {
      text = text.replace(/^\s+/, '');
      trimNext = false;
    }
    let j = open + 2;
    const raw = source[j] === '{';
    if (raw) j += 1;
    if (source[j] === '~') {
      text = text.replace(/\s+$/, '');
      j += 1;
    }
    pushText();
    let kind;
    let body;
    let end;
    if (!raw && source.startsWith('!--', j)) {
      end = source.indexOf('--', j + 3);
      while (end !== -1 && !/^--~?}}/.test(source.slice(end, end + 5))) end = source.indexOf('--', end + 1);
      if (end === -1) throw new TemplateError('Unclosed comment', { source, position: open, name });
      kind = 'comment';
      body = '';
      end += 2;
    } else if (!raw && source[j] === '!') {
      end = source.indexOf('}}', j);
      if (end === -1) throw new TemplateError('Unclosed comment', { source, position: open, name });
      if (source[end - 1] === '~') end -= 1;
      kind = 'comment';
      body = '';
    } else {
      end = endOf(source, j, raw ? '}}}' : '}}', name, open);
      body = source.slice(j, end);
      kind = raw ? 'raw' : 'output';
      const marker = body.trimStart()[0];
      if (!raw && (marker === '#' || marker === '/' || marker === '>')) kind = marker;
      if (!raw && /^\s*else\b/.test(body)) kind = 'else';
    }
    const start = j + (body.length - body.trimStart().length);
    parts.push({ kind, body: body.trim(), start, position: open });
    if (source[end] === '~') {
      trimNext = true;
      end += 1;
    }
    i = end + (raw ? 3 : 2);
  }
  if (trimNext) text = text.replace(/^\s+/, '');
  pushText();
  return parts;
}

module.exports = { scan };
