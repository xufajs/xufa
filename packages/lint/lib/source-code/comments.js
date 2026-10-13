// The comments that speak to the linter: /* eslint-disable no-alert -- a reason */, /* global a:writable */,
// /* exported a */, /* eslint eqeqeq: "off" */. A comment is a directive when it starts with a label (words in
// lower case joined by -); what follows is its value, up to a reason after -- (with space on both sides).

const LABEL = /^([a-z]+(?:-[a-z]+)*)(?:\s|$)/u;
const REASON = /\s-{2,}\s/u;
const SEVERITIES = new Set([0, 1, 2, 'off', 'warn', 'error']);

/** The label, value and reason of a comment's text: { label, value, justification }; undefined if not a directive. */
function parseDirective(text) {
  const reason = REASON.exec(text);
  const directive = (reason ? text.slice(0, reason.index) : text).trim();
  const match = LABEL.exec(directive);
  if (!match) return undefined;
  return {
    label: match[1],
    value: directive.slice(match[1].length).trim(),
    justification: reason ? text.slice(reason.index + reason[0].length).trim() : '',
  };
}

/** Names separated by commas (`a, "b"`), quotes off: { a: true, b: true }. */
function parseList(text) {
  const names = {};
  for (const part of text.split(',')) {
    const name = part.trim().replace(/^(['"]?)(.*)\1$/su, '$2');
    if (name) names[name] = true;
  }
  return names;
}

/** Names with a value or none, by spaces or commas (`a, b:writable`): { a: null, b: 'writable' }. */
function parseNames(text) {
  const names = {};
  const collapsed = text.trim().replace(/(?<!\s)\s*([:,])\s*/gu, '$1');
  for (const item of collapsed.split(/\s|,+/u)) {
    if (!item) continue;
    const [name, value = null] = item.split(':');
    names[name] = value;
  }
  return names;
}

// An object as ESLint's CLI reads its options (levn): `a: 1, b: [x, {c: 'd'}]`, its braces optional. Tokens are
// strings in either quotes, /regular expressions/, #dates#, the punctuation [](){}:, and words (spaces inside a run of
// words are kept: `2 b` is one); a value is the words up to the next comma, keys and values need no quotes, and
// lists and objects may end with a comma. Then values are what they look like (castValue).
const TOKEN =
  /("(?:\\"|[^"])*")|('(?:\\'|[^'])*')|(\/(?:\\\/|[^/])*\/[a-zA-Z]*)|(#.*#)|([[\](){}:,])|([^\s[\](){}:,](?:\s*[^\s[\](){}:,]+)*)|\s*/;

class Reader {
  constructor(text) {
    this.tokens = text.split(TOKEN).filter(Boolean);
    this.at = 0;
  }

  get next() {
    return this.tokens[this.at];
  }

  get done() {
    return this.at >= this.tokens.length;
  }

  take(token) {
    if (this.next !== token) throw new Error(`Expected '${token}', got '${this.next}'`);
    this.at += 1;
  }

  // The tokens up to one of `stops`, as one text.
  text(stops) {
    let text = '';
    while (!this.done && !stops.includes(this.next)) text += this.tokens[this.at++];
    return text;
  }

  value(stops) {
    if (this.next === '[') return this.list('[', ']');
    if (this.next === '(') return this.list('(', ')');
    if (this.next === '{') return this.fields(true);
    return this.text(stops);
  }

  list(open, close) {
    this.take(open);
    const items = [];
    while (!this.done && this.next !== close) {
      items.push(this.value([',', close]));
      if (this.next === ',') this.at += 1;
    }
    this.take(close);
    return items;
  }

  fields(braced) {
    if (braced) this.take('{');
    const fields = {};
    const stops = braced ? [',', '}'] : [','];
    while (!this.done && !(braced && this.next === '}')) {
      const key = this.text([':']);
      this.take(':');
      fields[key] = this.value(stops);
      if (this.next === ',') this.at += 1;
    }
    if (braced) this.take('}');
    return fields;
  }
}

const ESCAPES = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

// A text in quotes without them, its escapes read; any other text as it is.
function unquote(text) {
  const quoted = /^(['"])([\s\S]*)\1$/.exec(text);
  if (!quoted) return text;
  return quoted[2].replace(/\\([^u]|u[0-9a-fA-F]{4})/g, (all, escaped) => {
    if (escaped.length > 1) return JSON.parse(`"${all}"`);
    return ESCAPES[escaped] ?? escaped;
  });
}

// What a word is: undefined, null, NaN, a boolean, a number (what + makes one of: 0x2, 1e3, Infinity), a #date#,
// a /regular expression/ (flags gimy), or else a string.
function castValue(value) {
  if (Array.isArray(value)) return value.map(castValue);
  if (typeof value === 'object') return castFields(value);
  if (value === 'undefined') return undefined;
  if (value === 'null') return null;
  if (value === 'NaN') return NaN;
  if (value === 'true' || value === 'false') return value === 'true';
  if (!Number.isNaN(+value)) return +value;
  const date = /^#([\s\S]*)#$/.exec(value);
  if (date) {
    const time = new Date(+date[1] || date[1]);
    if (!Number.isNaN(time.getTime())) return time;
  }
  const regexp = /^\/([\s\S]*)\/([gimy]*)$/.exec(value);
  if (regexp) return new RegExp(regexp[1], regexp[2]);
  return unquote(value);
}

function castFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) out[unquote(key)] = castValue(value);
  return out;
}

function parseObject(text) {
  const reader = new Reader(text);
  const fields = reader.fields(reader.next === '{');
  if (!reader.done) throw new Error(`Error parsing '${text}'.`);
  return castFields(fields);
}

const severityOf = (setting) => (Array.isArray(setting) ? setting[0] : setting);

/**
 * The settings of rules of a comment (`no-alert: 2, quotes: [2, single]`): { ok: true, config } or
 * { ok: false, error: { message } }. Read as the CLI reads options; when that fails or gives a severity that is not
 * one (`no-alert: 2 no-console: 2` without commas), as JSON with the names quoted and commas added.
 */
function parseRules(text) {
  try {
    const config = parseObject(text) || {};
    if (Object.values(config).every((setting) => SEVERITIES.has(severityOf(setting)))) return { ok: true, config };
  } catch {
    // Read below.
  }
  const json = text.replace(/(?<![-a-zA-Z0-9/])([-a-zA-Z0-9/]+):/gu, '"$1":').replace(/([\]0-9])\s+(?=")/u, '$1,');
  try {
    return { ok: true, config: JSON.parse(`{${json}}`) };
  } catch (error) {
    return { ok: false, error: { message: `Failed to parse JSON from '${json}': ${error.message}` } };
  }
}

// The labels of the comments that speak to the linter.
const DIRECTIVE_LABEL = /^(eslint(?:-env|-enable|-disable(?:(?:-next)?-line)?)?|exported|globals?)(?:\s|$)/u;

export { parseDirective, parseList, parseNames, parseRules, DIRECTIVE_LABEL };
