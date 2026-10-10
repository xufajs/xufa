// The text of an email from its HTML, for the clients that show no HTML (and the spam filters that read both): the
// blocks on lines of their own, links as "text (url)", lists with dashes, the entities decoded, and no scripts, styles
// nor heads.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…' };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole;
    }
    const name = code.toLowerCase();
    return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : whole;
  });
}

function textOf(html) {
  if (!html) return '';
  let text = String(html)
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Links: their text, and the address when it says something else.
    .replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (whole, quote, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, '').trim();
      const address = decode(href);
      if (!label) return address;
      return decode(label) === address || address.startsWith('#') ? label : `${label} (${address})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|section|header|footer)\s*>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|tr|table|ul|ol|blockquote|section|header|footer)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' ')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '');
  text = decode(text)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export { textOf };
