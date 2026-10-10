// The XML of the stores of objects (S3, Azure Blob): the text of a tag, of every tag of a name, and text escaped.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const unescapeXml = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, name) => {
    if (name[0] === '#')
      return String.fromCodePoint(
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      );
    return ENTITIES[name.toLowerCase()];
  });

// The text of the first <name> (attributes allowed), unescaped; null when there is none.
const tag = (xml, name) => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? unescapeXml(match[1]) : null;
};

// The inner XML of every <name>.
const tags = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1]);

const escapeXml = (text) =>
  text.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[c]};`);

export { tag, tags, escapeXml, unescapeXml };
