// Messages in languages (OpenL Tablets' msg(code, arguments...)): bundles of texts by locale ('' the default, 'fr',
// 'de_DE'), as the .properties files of a project's i18n folder give them; the text of a code in the locale of the
// runtime context, from its most specific bundle that has it (de_DE, then de, then the default), its {0}, {1}...
// replaced by the arguments as Java's MessageFormat writes them.

// The entries of the text of a .properties file: key = value (or key: value, key value), # and ! comments, \ at a
// line end going on, \uXXXX, \t, \n and \\ escapes.
function parseProperties(text) {
  const entries = {};
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].replace(/^\s+/, '');
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    // (An odd number of backslashes at the end: the next line goes on.)
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) {
      i += 1;
      line = line.slice(0, -1) + lines[i].replace(/^\s+/, '');
    }
    const match = /^((?:\\.|[^:=\s\\])*)\s*[:=\s]?\s*(.*)$/.exec(line);
    if (!match) continue;
    entries[unescape(match[1])] = unescape(match[2]);
  }
  return entries;
}

function unescape(text) {
  return text.replace(/\\(u[\da-fA-F]{4}|.)/g, (_, code) => {
    if (code[0] === 'u' && code.length === 5) return String.fromCharCode(parseInt(code.slice(1), 16));
    return { t: '\t', n: '\n', r: '\r', f: '\f' }[code] ?? code;
  });
}

// The tag of a locale (fr-CA, de_DE, a Locale of toLocale()) as the names of bundles: [de_DE, de, ''].
function bundleNamesOf(locale) {
  const tag = locale && typeof locale === 'object' ? String(locale.toString?.() ?? '') : String(locale ?? '');
  const [language = '', country = ''] = tag.trim().split(/[-_]/);
  const names = [];
  if (language && country) names.push(`${language.toLowerCase()}_${country.toUpperCase()}`);
  if (language) names.push(language.toLowerCase());
  names.push('');
  return names;
}

// An argument as MessageFormat writes it: numbers grouped with up to 3 decimals (25.0 is 25), dates as their day.
function argumentText(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'bigint') {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('en-US', { maximumFractionDigits: 3 })
      : number > 0
        ? '∞'
        : number < 0
          ? '-∞'
          : 'NaN';
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// The text of a code in a locale, its arguments in it (the code itself when no bundle has it).
function messageOf(bundles, locale, code, args = []) {
  const names = bundleNamesOf(locale);
  const bundle = names.map((name) => bundles?.[name]).find((entries) => entries && Object.hasOwn(entries, code));
  if (!bundle) return String(code);
  // ('' is a quote, as MessageFormat reads it; {n} an argument.)
  return bundle[code]
    .replace(/\{(\d+)\}/g, (all, n) => (Number(n) < args.length ? argumentText(args[Number(n)]) : all))
    .replace(/''/g, "'");
}

export { parseProperties, messageOf, bundleNamesOf };
