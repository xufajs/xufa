// printf-like messages: %s %d %i %f %j %o %O %%, as pino formats them.
import { safeStringify } from './stringify.js';

function asJson(value) {
  if (typeof value === 'string') return `'${value}'`;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return safeStringify(value);
  }
}

// Formats `message` with the arguments of `args` from index `start`. Arguments without a placeholder are ignored.
function format(message, args, start) {
  if (start >= args.length || message.indexOf('%') === -1) return message;
  let out = '';
  let last = 0;
  let argIndex = start;
  const len = message.length;
  for (let i = 0; i < len - 1; i += 1) {
    if (message.charCodeAt(i) !== 37) continue; // %
    const type = message[i + 1];
    if (type === '%') {
      out += message.slice(last, i + 1);
      last = i + 2;
      i += 1;
      continue;
    }
    if (argIndex >= args.length) break;
    let replacement;
    const arg = args[argIndex];
    switch (type) {
      case 's':
        replacement = typeof arg === 'object' && arg !== null ? asJson(arg) : String(arg);
        break;
      case 'd':
      case 'f':
        if (arg == null) replacement = String(arg);
        else replacement = String(Number(arg));
        break;
      case 'i':
        if (arg == null) replacement = String(arg);
        else replacement = String(Math.floor(Number(arg)));
        break;
      case 'j':
      case 'o':
      case 'O':
        replacement = asJson(arg);
        break;
      default:
        continue;
    }
    argIndex += 1;
    out += message.slice(last, i) + replacement;
    last = i + 2;
    i += 1;
  }
  return last === 0 ? message : out + message.slice(last);
}

export { format };
