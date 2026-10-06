'use strict';

// .env files: KEY=value lines. `export ` before a key is allowed; values in double quotes have escapes (\n, \t, \",
// \\) and can be several lines; in single quotes or backticks, they are as written; unquoted, a # after a space starts
// a comment, and spaces around are left out. Lines empty or starting with # are nothing. A line of something else is
// an error (with its number).
const { ConfigError } = require('./errors');

const KEY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*/;
const ESCAPES = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', $: '$' };

function parseDotenv(text, file = '.env') {
  const out = {};
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(#.*)?$/.test(line)) continue;
    const match = KEY.exec(line);
    if (!match) throw new ConfigError(`${file}:${i + 1}: not a KEY=value line`);
    const key = match[1];
    let rest = line.slice(match[0].length);
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      // To the closing quote, on this line or the next ones.
      let body = rest.slice(1);
      let end = findClose(body, quote);
      const start = i;
      while (end === -1 && i + 1 < lines.length) {
        i += 1;
        body += `\n${lines[i]}`;
        end = findClose(body, quote);
      }
      if (end === -1) throw new ConfigError(`${file}:${start + 1}: the value of ${key} has no closing ${quote}`);
      const raw = body.slice(0, end);
      const after = body.slice(end + 1);
      if (!/^\s*(#.*)?$/.test(after)) throw new ConfigError(`${file}:${i + 1}: text after the value of ${key}`);
      out[key] = quote === '"' ? raw.replace(/\\(.)/g, (all, c) => (c in ESCAPES ? ESCAPES[c] : all)) : raw;
    } else {
      const comment = rest.search(/\s#/);
      if (comment !== -1) rest = rest.slice(0, comment);
      out[key] = rest.trim();
    }
  }
  return out;
}

function findClose(body, quote) {
  for (let i = 0; i < body.length; i += 1) {
    if (quote === '"' && body[i] === '\\') {
      i += 1;
      continue;
    }
    if (body[i] === quote) return i;
  }
  return -1;
}

module.exports = { parseDotenv };
