// serializeDoctypeContent of parse5-htmlparser2-tree-adapter (parse5's repository, MIT), which parse5's tests of
// source locations use: the text of a doctype without its < and >.
function enquoteDoctypeId(id) {
  const quote = id.includes('"') ? "'" : '"';
  return quote + id + quote;
}

function serializeDoctypeContent(name, publicId, systemId) {
  let text = '!DOCTYPE ';
  if (name) text += name;
  if (publicId) text += ` PUBLIC ${enquoteDoctypeId(publicId)}`;
  else if (systemId) text += ' SYSTEM';
  if (systemId) text += ` ${enquoteDoctypeId(systemId)}`;
  return text;
}

export { serializeDoctypeContent };
