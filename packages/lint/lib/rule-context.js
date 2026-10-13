// What the `context` of a rule is made from: the file (its name and path, the cwd, its sourceCode), its language
// options and settings. Each rule gets `extend({ id, options, report })` of it: an object of its own whose prototype
// is this one. Both are frozen.

class FileContext {
  cwd;
  filename;
  physicalFilename;
  sourceCode;
  parserOptions;
  parserPath;
  languageOptions;
  settings;

  constructor({ cwd, filename, physicalFilename, sourceCode, parserOptions, parserPath, languageOptions, settings }) {
    this.cwd = cwd;
    this.filename = filename;
    this.physicalFilename = physicalFilename;
    this.sourceCode = sourceCode;
    this.parserOptions = parserOptions;
    this.parserPath = parserPath;
    this.languageOptions = languageOptions;
    this.settings = settings;
    Object.freeze(this);
  }

  getCwd() {
    return this.cwd;
  }

  getFilename() {
    return this.filename;
  }

  getPhysicalFilename() {
    return this.physicalFilename;
  }

  getSourceCode() {
    return this.sourceCode;
  }

  extend(extension) {
    return Object.freeze(Object.assign(Object.create(this), extension));
  }
}

export { FileContext };
