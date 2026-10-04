// The text of hstore values of PostgreSQL ('"a"=>"1", "b"=>NULL') and back: objects of strings (or nulls).

const quote = (text) => `"${String(text).replace(/[\\"]/g, '\\$&')}"`;

// The hstore text of an object (values as strings; null and undefined as NULL).
function toHstore(object) {
  return Object.keys(object)
    .map((key) => {
      const value = object[key];
      return `${quote(key)}=>${value === null || value === undefined ? 'NULL' : quote(value)}`;
    })
    .join(', ');
}

// The object of an hstore text.
function parseHstore(text) {
  const result = {};
  let i = 0;
  const skip = () => {
    while (i < text.length && (text[i] === ' ' || text[i] === ',')) i += 1;
  };
  const token = () => {
    if (text[i] === '"') {
      let value = '';
      i += 1;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i += 1;
        value += text[i];
        i += 1;
      }
      i += 1;
      return { value, quoted: true };
    }
    const start = i;
    while (i < text.length && text[i] !== '=' && text[i] !== ',' && text[i] !== ' ') i += 1;
    return { value: text.slice(start, i), quoted: false };
  };
  skip();
  while (i < text.length) {
    const key = token();
    while (text[i] === ' ') i += 1;
    i += 2; // =>
    while (text[i] === ' ') i += 1;
    const value = token();
    result[key.value] = !value.quoted && value.value.toUpperCase() === 'NULL' ? null : value.value;
    skip();
  }
  return result;
}

module.exports = { toHstore, parseHstore };
