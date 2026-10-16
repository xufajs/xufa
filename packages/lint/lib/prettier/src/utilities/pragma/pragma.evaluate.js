export const FORMAT_PRAGMAS = ['format', 'prettier'];
export const FORMAT_IGNORE_PRAGMAS = FORMAT_PRAGMAS.map((pragma) => `no${pragma}`);
export const FORMAT_PRAGMA_TO_INSERT = FORMAT_PRAGMAS[0];
