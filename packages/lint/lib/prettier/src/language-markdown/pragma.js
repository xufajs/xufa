import { parseFrontMatter } from '../main/front-matter/index.js';
import { FORMAT_PRAGMA_TO_INSERT } from '../utilities/pragma/pragma.evaluate.js';

const insertPragma = (text) => {
  const { frontMatter } = parseFrontMatter(text);
  const pragma = `<!-- @${FORMAT_PRAGMA_TO_INSERT} -->`;
  return frontMatter
    ? `${frontMatter.raw}\n\n${pragma}\n\n${text.slice(frontMatter.end.index)}`
    : `${pragma}\n\n${text}`;
};

export { insertPragma };
