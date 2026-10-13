// Embedded code (the code blocks of markdown), for prettier's multiparser: the options of its parser, made from those
// of the text it is in (as prettier's normalizeFormatOptions makes them), and its tree. JavaScript, TypeScript, JSON
// and markdown (in markdown) are formatted; other languages throw, and prettier's multiparser leaves them as they are.

import { optionsFor, parseWith } from './format.js';

const FORMATTED = new Set(['babel', 'typescript', 'json', 'json5', 'jsonc', 'markdown']);

function embeddedOptions(raw) {
  const { parser } = raw;
  if (!FORMATTED.has(parser)) throw new Error(`Embedded ${parser} is not formatted`);
  // The options of the text it is in, but those its parser sets (printer, locations...).
  const given = { ...raw };
  for (const key of ['printer', 'astFormat', 'getVisitorKeys', 'locStart', 'locEnd']) delete given[key];
  return optionsFor(parser, given);
}

function parseEmbedded(text, options) {
  return parseWith(text, options);
}

export { embeddedOptions, parseEmbedded };
