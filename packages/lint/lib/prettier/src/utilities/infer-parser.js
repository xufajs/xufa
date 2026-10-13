// @xufa/lint: the parser of a language, a file name or an extension, among prettier's languages (languages.json,
// evaluated by tools/port-format from prettier's getSupportInfo()).
import languages from './languages.json' with { type: 'json' };

const byName = (name) =>
  name &&
  (languages.find((language) => language.name.toLowerCase() === name) ??
    languages.find((language) => language.aliases?.includes(name)) ??
    languages.find((language) => language.extensions?.includes(`.${name}`)));

const byFile = (file) => {
  if (!file) return;
  const base = String(file).split(/[\\/]/).pop().toLowerCase();
  return (
    languages.find((language) => language.filenames?.some((name) => name.toLowerCase() === base)) ??
    languages.find((language) => language.extensions?.some((extension) => base.endsWith(extension)))
  );
};

function inferParser(options, fileInfo) {
  const language = byName(fileInfo.language) ?? byFile(fileInfo.physicalFile) ?? byFile(fileInfo.file);
  return language?.parsers[0];
}

export default inferParser;
