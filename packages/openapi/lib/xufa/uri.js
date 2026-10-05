'use strict';

// URIs (RFC 3986) as json-schema-resolver needs them from fast-uri: parse() into components, with the kind of
// reference ('same-document', 'relative', 'absolute', 'uri'), and serialize() back (scheme and host in lower case).
const PATTERN = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;

function parse(text) {
  const match = PATTERN.exec(String(text));
  const components = {
    scheme: match[1],
    userinfo: undefined,
    host: undefined,
    port: undefined,
    path: match[3] || '',
    query: match[4],
    fragment: match[5],
  };
  if (match[2] !== undefined) {
    let authority = match[2];
    const at = authority.lastIndexOf('@');
    if (at !== -1) {
      components.userinfo = authority.slice(0, at);
      authority = authority.slice(at + 1);
    }
    const port = /:(\d*)$/.exec(authority);
    if (port && !authority.endsWith(']')) {
      components.port = port[1] === '' ? undefined : Number(port[1]);
      authority = authority.slice(0, port.index);
    }
    components.host = authority;
  }
  if (
    components.scheme === undefined &&
    components.userinfo === undefined &&
    components.host === undefined &&
    components.port === undefined &&
    components.query === undefined &&
    !components.path
  ) {
    components.reference = 'same-document';
  } else if (components.scheme === undefined) components.reference = 'relative';
  else if (components.fragment === undefined) components.reference = 'absolute';
  else components.reference = 'uri';
  return components;
}

function serialize(components) {
  let out = '';
  if (components.scheme !== undefined) out += `${String(components.scheme).toLowerCase()}:`;
  if (components.host !== undefined) {
    out += '//';
    if (components.userinfo !== undefined) out += `${components.userinfo}@`;
    out += String(components.host).toLowerCase();
    if (components.port !== undefined && components.port !== '') out += `:${components.port}`;
  }
  let path = components.path || '';
  if (components.host !== undefined && path && path[0] !== '/') path = `/${path}`;
  out += path;
  if (components.query !== undefined) out += `?${components.query}`;
  if (components.fragment !== undefined) out += `#${components.fragment}`;
  return out;
}

module.exports = { parse, serialize };
