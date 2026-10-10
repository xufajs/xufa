// The addresses a request went through (its socket and X-Forwarded-For), and which of them are trusted proxies:
// what proxy-addr does for the trustProxy option.

const NAMES = {
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  loopback: ['127.0.0.1/8', '::1/128'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// [kind, bytes] of an address, or null: 4 bytes for IPv4, 16 for IPv6.
function parseIp(address) {
  if (typeof address !== 'string') return null;
  let text = address.trim();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  const v4 = IPV4.exec(text);
  if (v4) {
    const bytes = v4.slice(1).map(Number);
    return bytes.every((b) => b <= 255) ? { kind: 'ipv4', bytes } : null;
  }
  return parseIpv6(text);
}

function parseIpv6(text) {
  if (text.indexOf(':') === -1) return null;
  let head = text;
  let tailV4 = null;
  const lastColon = head.lastIndexOf(':');
  if (head.indexOf('.', lastColon) !== -1) {
    tailV4 = parseIp(head.slice(lastColon + 1));
    if (tailV4 === null || tailV4.kind !== 'ipv4') return null;
    head = `${head.slice(0, lastColon + 1)}0:0`;
  }
  const double = head.indexOf('::');
  if (double !== head.lastIndexOf('::')) return null;
  let groups;
  if (double !== -1) {
    const left = head.slice(0, double) ? head.slice(0, double).split(':') : [];
    const right = head.slice(double + 2) ? head.slice(double + 2).split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...new Array(missing).fill('0'), ...right];
  } else {
    groups = head.split(':');
  }
  if (groups.length !== 8) return null;
  const bytes = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  if (tailV4) bytes.splice(12, 4, ...tailV4.bytes);
  return { kind: 'ipv6', bytes };
}

function isIpv4Mapped(ip) {
  if (ip.kind !== 'ipv6') return false;
  for (let i = 0; i < 10; i += 1) if (ip.bytes[i] !== 0) return false;
  return ip.bytes[10] === 0xff && ip.bytes[11] === 0xff;
}

function toIpv4(ip) {
  return { kind: 'ipv4', bytes: ip.bytes.slice(12) };
}

function prefixLengthOfMask(mask) {
  let bits = 0;
  let ended = false;
  for (const byte of mask.bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      if (byte & (1 << bit)) {
        if (ended) return null;
        bits += 1;
      } else {
        ended = true;
      }
    }
  }
  return bits;
}

// A trusted range: [ip, prefix length].
function parseRange(note) {
  const slash = note.lastIndexOf('/');
  const text = slash === -1 ? note : note.slice(0, slash);
  let ip = parseIp(text);
  if (ip === null) throw new TypeError(`invalid IP address: ${text}`);
  const max = ip.kind === 'ipv4' ? 32 : 128;
  let bits = max;
  if (slash !== -1) {
    const rangeText = note.slice(slash + 1);
    if (/^\d+$/.test(rangeText)) {
      bits = Number(rangeText);
    } else {
      const mask = parseIp(rangeText);
      bits = mask !== null && mask.kind === 'ipv4' && ip.kind === 'ipv4' ? prefixLengthOfMask(mask) : null;
    }
    if (bits === null || bits <= 0 || bits > max) throw new TypeError(`invalid range on address: ${note}`);
  }
  if (isIpv4Mapped(ip) && bits >= 96) {
    ip = toIpv4(ip);
    bits -= 96;
  }
  return [ip, bits];
}

function matchesPrefix(ip, range, bits) {
  const full = bits >> 3;
  for (let i = 0; i < full; i += 1) if (ip.bytes[i] !== range.bytes[i]) return false;
  const rest = bits & 7;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (ip.bytes[full] & mask) === (range.bytes[full] & mask);
}

function matches(address, ranges) {
  const ip = parseIp(address);
  if (ip === null) return false;
  for (const [range, bits] of ranges) {
    let candidate = ip;
    if (ip.kind !== range.kind) {
      if (range.kind === 'ipv4' && isIpv4Mapped(ip)) candidate = toIpv4(ip);
      else if (range.kind === 'ipv6' && ip.kind === 'ipv4') {
        candidate = { kind: 'ipv6', bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...ip.bytes] };
      } else continue;
    }
    if (matchesPrefix(candidate, range, bits)) return true;
  }
  return false;
}

// A function (address, index) => boolean telling whether a hop is trusted.
function compile(value) {
  if (!value) throw new TypeError('argument is required');
  const notes = typeof value === 'string' ? [value] : [...value];
  const expanded = [];
  for (const note of notes) {
    if (Object.prototype.hasOwnProperty.call(NAMES, note)) expanded.push(...NAMES[note]);
    else expanded.push(note);
  }
  const ranges = expanded.map(parseRange);
  if (ranges.length === 0) return () => false;
  return (address) => matches(address, ranges);
}

// The addresses of a request: its socket first, then X-Forwarded-For from the closest proxy.
function forwarded(req) {
  const socketAddress = req.socket ? req.socket.remoteAddress : undefined;
  const addresses = [socketAddress];
  const header = req.headers['x-forwarded-for'];
  if (header) {
    const list = String(header).split(',');
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const entry = list[i].trim();
      if (entry !== '') addresses.push(entry);
    }
  }
  return addresses;
}

// The addresses up to the first untrusted one.
function all(req, trust) {
  const addresses = forwarded(req);
  if (!trust) return addresses;
  const fn = typeof trust === 'function' ? trust : compile(trust);
  for (let i = 0; i < addresses.length - 1; i += 1) {
    if (!fn(addresses[i], i)) {
      addresses.length = i + 1;
      break;
    }
  }
  return addresses;
}

export { compile, all, forwarded, parseIp };
