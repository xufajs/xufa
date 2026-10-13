import { extract, parseWithComments, print, strip } from '../utilities/docblock.js';

import { FORMAT_IGNORE_PRAGMAS, FORMAT_PRAGMA_TO_INSERT, FORMAT_PRAGMAS } from '../utilities/pragma/pragma.evaluate.js';
import getShebang from './utilities/get-shebang.js';

function parseDocBlock(text) {
  const shebang = getShebang(text);
  if (shebang) {
    text = text.slice(shebang.length + 1);
  }

  const docBlock = extract(text);
  const { pragmas, comments } = parseWithComments(docBlock);

  return { shebang, text, pragmas, comments };
}

function hasPragma(text) {
  const { pragmas } = parseDocBlock(text);
  return FORMAT_PRAGMAS.some((pragma) => Object.hasOwn(pragmas, pragma));
}

function hasIgnorePragma(text) {
  const { pragmas } = parseDocBlock(text);
  return FORMAT_IGNORE_PRAGMAS.some((pragma) => Object.hasOwn(pragmas, pragma));
}

function insertPragma(originalText) {
  const { shebang, text, pragmas, comments } = parseDocBlock(originalText);
  const strippedText = strip(text);

  let docBlock = print({
    pragmas: {
      [FORMAT_PRAGMA_TO_INSERT]: '',
      ...pragmas,
    },
    comments: comments.trimStart(),
  });

  return (shebang ? `${shebang}\n` : '') + docBlock + (strippedText.startsWith('\n') ? '\n' : '\n\n') + strippedText;
}

export { hasIgnorePragma, hasPragma, insertPragma };
