// The Vary header (vary): fields added to it once each, '*' alone. For @xufa/http/compression and @xufa/express.

const FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// The names of a list (commas, spaces around them).
export function tokens(text) {
  const list = [];
  let start = 0;
  let end = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x20) {
      if (start === end) {
        start = i + 1;
        end = start;
      }
    } else if (code === 0x2c) {
      list.push(text.substring(start, end));
      start = i + 1;
      end = start;
    } else end = i + 1;
  }
  list.push(text.substring(start, end));
  return list;
}

// A Vary with the fields added (those it has once, '*' alone).
export function appendVary(header, field) {
  if (typeof header !== 'string') throw new TypeError('header argument is required');
  if (!field) throw new TypeError('field argument is required');
  const fields = Array.isArray(field) ? field : tokens(String(field));
  if (!fields.every((name) => FIELD_NAME.test(name))) {
    throw new TypeError('field argument contains an invalid header name');
  }
  if (header === '*') return header;
  let value = header;
  const values = tokens(header.toLowerCase());
  if (fields.indexOf('*') !== -1 || values.indexOf('*') !== -1) return '*';
  fields.forEach((name) => {
    const lower = name.toLowerCase();
    if (values.indexOf(lower) === -1) {
      values.push(lower);
      value = value ? `${value}, ${name}` : name;
    }
  });
  return value;
}

// Adds the fields to the Vary of a response (node:http's).
export function vary(res, field) {
  const current = res.getHeader('Vary') || '';
  const value = appendVary(Array.isArray(current) ? current.join(', ') : String(current), field);
  if (value) res.setHeader('Vary', value);
}
