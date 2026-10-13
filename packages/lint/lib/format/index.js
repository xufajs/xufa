'use strict';

// The formatter: prettier 3.9.9's output for JavaScript, TypeScript, JSON and markdown (lib/prettier, ported), with
// the options of each file's config (its format key).

const fs = require('node:fs');
const path = require('node:path');
// (The formatter as one file: scripts/build-format.mjs bundles lib/prettier.)
const { format: formatText, parserOf } = require('../prettier/dist/format.mjs');

/** `text` formatted as the file `filepath` (its extension tells the language), with prettier's options. */
function format(text, options = {}) {
  return formatText(text, options);
}

/** The files to format under the given paths (files given by name are formatted when the config does not ignore them). */
function formattedFiles(paths, configs) {
  const out = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!configs.isIgnored(`${file}${path.sep}`) && !configs.isIgnored(path.join(file, '_'))) walk(file);
      } else if (entry.isFile() && configs.isFormatted(file)) {
        out.add(file);
      }
    }
  };
  for (const given of paths) {
    const target = path.resolve(given);
    if (!fs.existsSync(target)) throw new Error(`No files matching the pattern "${given}" were found.`);
    if (fs.statSync(target).isDirectory()) walk(target);
    else if (parserOf(target) && !configs.isIgnored(target)) out.add(target);
  }
  return [...out];
}

/**
 * Formats the files of `paths`: [{ filePath, formatted, changed, error }]; with write, writes those that change.
 */
async function formatFiles(paths, configs, { write = false } = {}) {
  const results = [];
  for (const file of formattedFiles(paths, configs)) {
    const text = fs.readFileSync(file, 'utf8');
    const { ignores, ...options } = configs.configFor(file).format || {};
    try {
      const formatted = await format(text, { ...options, filepath: file });
      const changed = formatted !== text;
      if (write && changed) fs.writeFileSync(file, formatted);
      results.push({ filePath: file, changed });
    } catch (error) {
      results.push({ filePath: file, changed: false, error });
    }
  }
  return results;
}

module.exports = { format, formatFiles, formattedFiles, parserOf };
