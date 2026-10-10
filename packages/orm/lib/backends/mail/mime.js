// Messages of email (RFC 5322 and MIME) for the mail backends: addresses read and written, headers (non-ASCII text
// as encoded words, folded at 78 characters, CR and LF refused), bodies in quoted-printable or base64 (7-bit: no
// server needs 8BITMIME), text and HTML as alternatives, inline images (cid:) and attachments (names in RFC 2231).
import crypto from 'node:crypto';
import { domainToASCII } from 'node:url';
import { contentTypeOf } from '../../blob.js';

import { MailError } from '../../errors.js';

// A message that cannot be made (an address, a header): 400.
const invalid = (message) => Object.assign(new MailError(message), { statusCode: 400 });

const ASCII = /^[\x20-\x7e]*$/;
// What a display name may be without quotes (atext and spaces).
const ATOMS = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~ ]+$/;

// An address: { name, address }, its domain in ASCII (punycode). A local part that is not ASCII needs SMTPUTF8.
function address(name, text) {
  const value = String(text).trim();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1 || /[\s<>(),;:"\\[\]]/.test(value)) {
    throw invalid(`Not an email address: ${JSON.stringify(value)}`);
  }
  const domain = domainToASCII(value.slice(at + 1));
  if (!domain) throw invalid(`Not an email address: ${JSON.stringify(value)}`);
  return { name: name ? String(name).trim() : '', address: `${value.slice(0, at)}@${domain}` };
}

// The parts of a list of addresses separated by commas (not inside quotes nor angle brackets).
function split(text) {
  const parts = [];
  let current = '';
  let quoted = false;
  let angle = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\' && quoted) {
      current += c + (text[i + 1] || '');
      i += 1;
    } else {
      if (c === '"') quoted = !quoted;
      else if (c === '<' && !quoted) angle = true;
      else if (c === '>' && !quoted) angle = false;
      if (c === ',' && !quoted && !angle) {
        parts.push(current);
        current = '';
      } else current += c;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

// Addresses of a value: 'ada@example.com', 'Ada <ada@example.com>', '"Lovelace, Ada" <ada@...>, bob@...',
// { name, address }, or an array of them.
function parseAddresses(value) {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(parseAddresses);
  if (typeof value === 'object') return [address(value.name, value.address)];
  return split(String(value)).map((part) => {
    const match = /^(.*?)\s*<([^<>]+)>$/.exec(part);
    if (!match) return address('', part);
    let name = match[1].trim();
    if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/\\(.)/g, '$1');
    return address(name, match[2]);
  });
}

// Encoded words of a text that is not ASCII (=?UTF-8?B?...?=, of 39 bytes: 64 characters, so that a header line with
// one is under 78; characters are not split).
function encodedWords(text) {
  const words = [];
  let bytes = [];
  let size = 0;
  for (const char of text) {
    const encoded = Buffer.from(char);
    if (size + encoded.length > 39) {
      words.push(Buffer.concat(bytes));
      bytes = [];
      size = 0;
    }
    bytes.push(encoded);
    size += encoded.length;
  }
  if (bytes.length) words.push(Buffer.concat(bytes));
  return words.map((word) => `=?UTF-8?B?${word.toString('base64')}?=`).join(' ');
}

// A text of a header: as it is when it is ASCII, encoded words otherwise.
function headerText(text) {
  return ASCII.test(text) ? text : encodedWords(text);
}

function formatAddress({ name, address: value }) {
  if (!name) return value;
  let shown;
  if (!ASCII.test(name)) shown = encodedWords(name);
  else if (ATOMS.test(name)) shown = name;
  else shown = `"${name.replace(/(["\\])/g, '\\$1')}"`;
  return `${shown} <${value}>`;
}

function checkHeader(name, value) {
  if (/[\r\n]/.test(value)) throw invalid(`The header ${name} has a line break`);
  if (!/^[!-9;-~]+$/.test(name)) throw invalid(`Not the name of a header: ${JSON.stringify(name)}`);
}

// A header line, folded at spaces to lines of 78 characters at most.
function header(name, value) {
  checkHeader(name, value);
  const words = `${name}: ${value}`.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    // Not right after the name: its first word stays with it.
    if (line && line !== `${name}:` && line.length + 1 + word.length > 76) {
      lines.push(line);
      line = ` ${word}`;
    } else line = line ? `${line} ${word}` : word;
  }
  lines.push(line);
  return `${lines.join('\r\n')}\r\n`;
}

// The date of a message: Wed, 07 Oct 2026 12:00:00 +0000.
const dateHeader = (date) => date.toUTCString().replace(/GMT$/, '+0000');

// Quoted-printable (RFC 2045) of a text, its lines as CRLF, with soft breaks before 76 characters.
function quotedPrintable(text) {
  const lines = String(text)
    .replace(/\r\n|\r|\n/g, '\n')
    .split('\n');
  return lines
    .map((line) => {
      const bytes = Buffer.from(line);
      let encoded = '';
      for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        const last = i === bytes.length - 1;
        const plain = (byte >= 33 && byte <= 126 && byte !== 61) || ((byte === 32 || byte === 9) && !last);
        encoded += plain ? String.fromCharCode(byte) : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
      }
      const out = [];
      while (encoded.length > 76) {
        let cut = 75;
        // Not inside an =XX.
        if (encoded[cut - 1] === '=') cut -= 1;
        else if (encoded[cut - 2] === '=') cut -= 2;
        out.push(`${encoded.slice(0, cut)}=`);
        encoded = encoded.slice(cut);
      }
      out.push(encoded);
      return out.join('\r\n');
    })
    .join('\r\n');
}

const base64Lines = (buffer) => (buffer.toString('base64').match(/.{1,76}/g) || ['']).join('\r\n');

// A parameter of a header (a file name): name="value", or name*=UTF-8''... when it is not ASCII (RFC 2231).
function parameter(name, value) {
  if (ASCII.test(value)) return `${name}="${value.replace(/(["\\])/g, '\\$1')}"`;
  const encoded = encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${name}*=UTF-8''${encoded}`;
}

// A part with a body: a text (7bit when it is ASCII in short lines, quoted-printable otherwise) or bytes (base64).
function leaf(contentType, body, extraHeaders = '') {
  if (typeof body === 'string') {
    const simple = ASCII.test(body.replace(/\r?\n/g, '')) && body.split(/\r?\n/).every((line) => line.length <= 998);
    const content = simple ? body.replace(/\r\n|\r|\n/g, '\r\n') : quotedPrintable(body);
    const encoding = header('Content-Transfer-Encoding', simple ? '7bit' : 'quoted-printable');
    return `${header('Content-Type', contentType)}${encoding}${extraHeaders}\r\n${content}`;
  }
  const encoding = header('Content-Transfer-Encoding', 'base64');
  return `${header('Content-Type', contentType)}${encoding}${extraHeaders}\r\n${base64Lines(body)}`;
}

function multipart(kind, parts) {
  const boundary = `xufa-${crypto.randomBytes(12).toString('hex')}`;
  return `${header('Content-Type', `multipart/${kind}; boundary="${boundary}"`)}\r\n${parts
    .map((part) => `--${boundary}\r\n${part}\r\n`)
    .join('')}--${boundary}--`;
}

function bytesOf(attachment) {
  const { content } = attachment;
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === 'string') return Buffer.from(content, attachment.encoding === 'base64' ? 'base64' : 'utf8');
  if (content && content.type === 'Buffer' && Array.isArray(content.data)) return Buffer.from(content.data); // JSON
  throw invalid(`The content of the attachment ${attachment.filename || ''} is not a Buffer nor a string`);
}

function attachmentPart(attachment) {
  const filename = attachment.filename ? String(attachment.filename) : null;
  const type = attachment.contentType || (filename ? contentTypeOf(filename) : null) || 'application/octet-stream';
  let extra = '';
  if (attachment.cid) {
    extra += header('Content-ID', `<${attachment.cid}>`);
    extra += header('Content-Disposition', filename ? `inline; ${parameter('filename', filename)}` : 'inline');
  } else {
    extra += header('Content-Disposition', filename ? `attachment; ${parameter('filename', filename)}` : 'attachment');
  }
  return leaf(filename ? `${type}; ${parameter('name', filename)}` : type, bytesOf(attachment), extra);
}

// A message: its text (raw, CRLF), its envelope (from, to: every recipient) and its Message-ID (without <>).
//   { from, to, cc, bcc, replyTo, subject, text, html, headers: { name: value }, messageId, date,
//     attachments: [{ filename, content, contentType, cid, encoding }] }
function buildMessage(message) {
  const from = parseAddresses(message.from);
  if (from.length !== 1)
    throw invalid(from.length ? 'A message has one sender (from)' : 'A message needs a sender (from)');
  const to = parseAddresses(message.to);
  const cc = parseAddresses(message.cc);
  const bcc = parseAddresses(message.bcc);
  const replyTo = parseAddresses(message.replyTo);
  const recipients = [...new Set([...to, ...cc, ...bcc].map((item) => item.address))];
  if (recipients.length === 0) throw invalid('A message needs a recipient (to, cc or bcc)');
  const domain = from[0].address.split('@')[1];
  const messageId = message.messageId
    ? String(message.messageId).replace(/^<|>$/g, '')
    : `${crypto.randomUUID()}@${domain}`;

  let head = header('Date', dateHeader(message.date || new Date()));
  head += header('From', formatAddress(from[0]));
  if (to.length) head += header('To', to.map(formatAddress).join(', '));
  if (cc.length) head += header('Cc', cc.map(formatAddress).join(', '));
  if (replyTo.length) head += header('Reply-To', replyTo.map(formatAddress).join(', '));
  head += header(
    'Subject',
    headerText(message.subject === null || message.subject === undefined ? '' : String(message.subject))
  );
  head += header('Message-ID', `<${messageId}>`);
  head += header('MIME-Version', '1.0');
  for (const [name, value] of Object.entries(message.headers || {})) {
    if (/^(date|from|to|cc|bcc|reply-to|subject|message-id|mime-version|content-.*)$/i.test(name)) {
      throw invalid(`The header ${name} is made from the message: set it there`);
    }
    for (const item of Array.isArray(value) ? value : [value]) head += header(name, headerText(String(item)));
  }

  const { text, html } = message;
  const attachments = message.attachments || [];
  const textPart = text !== null && text !== undefined ? leaf('text/plain; charset=utf-8', String(text)) : null;
  const htmlPart = html !== null && html !== undefined ? leaf('text/html; charset=utf-8', String(html)) : null;
  let body;
  if (textPart && htmlPart) body = multipart('alternative', [textPart, htmlPart]);
  else body = htmlPart || textPart || leaf('text/plain; charset=utf-8', '');
  const inline = attachments.filter((item) => item.cid);
  const attached = attachments.filter((item) => !item.cid);
  if (inline.length) body = multipart('related', [body, ...inline.map(attachmentPart)]);
  if (attached.length) body = multipart('mixed', [body, ...attached.map(attachmentPart)]);

  const raw = Buffer.from(`${head}${body}\r\n`);
  // Addresses with a local part that is not ASCII travel only with SMTPUTF8.
  const utf8 = [...from, ...to, ...cc, ...bcc].some((item) => !ASCII.test(item.address));
  return { raw, messageId, envelope: { from: from[0].address, to: recipients }, utf8 };
}

export { buildMessage, parseAddresses, formatAddress, encodedWords, quotedPrintable, header };
