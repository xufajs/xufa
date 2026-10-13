// XML as the parts of .xlsx files are: elements with attributes, text and the five entities and character references;
// declarations, comments, processing instructions and CDATA too. Read into a tree of { name, attrs, children, text }
// (names without their prefix: x:row is row), and text escaped to write.
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (whole, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[entity] ?? whole;
  });
}

const localName = (name) => {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
};

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
const LINE_BREAKS = /\r\n?/g;

function parseXml(source) {
  // Line breaks are \n, as XML says (its parsers read \r\n and \r so; &#13; stays a \r).
  const xml = (typeof source === 'string' ? source : source.toString('utf8')).replace(LINE_BREAKS, '\n');
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  while (i < xml.length) {
    const open = xml.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (open === -1) {
      top.text += decode(xml.slice(i));
      break;
    }
    if (open > i) top.text += decode(xml.slice(i, open));
    if (xml.startsWith('<!--', open)) {
      i = xml.indexOf('-->', open) + 3;
    } else if (xml.startsWith('<![CDATA[', open)) {
      const close = xml.indexOf(']]>', open);
      top.text += xml.slice(open + 9, close);
      i = close + 3;
    } else if (xml[open + 1] === '?' || xml[open + 1] === '!') {
      i = xml.indexOf('>', open) + 1;
    } else if (xml[open + 1] === '/') {
      i = xml.indexOf('>', open) + 1;
      if (stack.length > 1) stack.pop();
    } else {
      let close = open + 1;
      let quote = null;
      while (close < xml.length) {
        const char = xml[close];
        if (quote) {
          if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
          quote = char;
        } else if (char === '>') {
          break;
        }
        close += 1;
      }
      const selfClosing = xml[close - 1] === '/';
      const inner = xml.slice(open + 1, selfClosing ? close - 1 : close);
      const space = inner.search(/\s/);
      const name = localName(space === -1 ? inner : inner.slice(0, space));
      const attrs = {};
      if (space !== -1) {
        ATTRIBUTE.lastIndex = 0;
        let match = ATTRIBUTE.exec(inner);
        while (match) {
          attrs[localName(match[1])] = decode(match[3] ?? match[4]);
          match = ATTRIBUTE.exec(inner);
        }
      }
      const element = { name, attrs, children: [], text: '' };
      top.children.push(element);
      if (!selfClosing) stack.push(element);
      i = close + 1;
    }
  }
  return root;
}

// The first child element of a name, and every one.
const child = (element, name) => element?.children.find((item) => item.name === name);
const children = (element, name) => (element ? element.children.filter((item) => item.name === name) : []);

// The elements of a name anywhere under one, in document order.
function descendants(element, name, found = []) {
  for (const item of element.children) {
    if (item.name === name) found.push(item);
    else descendants(item, name, found);
  }
  return found;
}

// Text for XML: the five characters escaped, and the control characters it cannot have dropped.
// eslint-disable-next-line no-control-regex -- the characters XML cannot have
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
function escapeXml(value) {
  return String(value)
    .replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char])
    .replace(CONTROL, '');
}

export { parseXml, child, children, descendants, escapeXml };
