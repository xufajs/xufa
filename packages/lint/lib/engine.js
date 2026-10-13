// Linting files: those of the given paths that the config lints (folders walked, ignored ones skipped), each with
// its config; with fix, what rules fix is written back. The results are ESLint's: [{ filePath, messages, errorCount,
// warningCount, fixableErrorCount, fixableWarningCount, output, source }].

import fs from 'node:fs';
import path from 'node:path';
import { Linter } from './linter.js';

// The files to lint under the given paths (files given by name are linted when the config does not ignore them).
function filesOf(paths, configs) {
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
      } else if (entry.isFile() && configs.isLinted(file)) {
        out.add(file);
      }
    }
  };
  for (const given of paths) {
    const target = path.resolve(given);
    if (!fs.existsSync(target)) throw new Error(`No files matching the pattern "${given}" were found.`);
    if (fs.statSync(target).isDirectory()) walk(target);
    else if (!configs.isIgnored(target)) out.add(target);
  }
  return [...out];
}

function count(messages) {
  const result = { errorCount: 0, fatalErrorCount: 0, warningCount: 0, fixableErrorCount: 0, fixableWarningCount: 0 };
  for (const message of messages) {
    if (message.severity === 2) {
      result.errorCount += 1;
      if (message.fatal) result.fatalErrorCount += 1;
      if (message.fix) result.fixableErrorCount += 1;
    } else {
      result.warningCount += 1;
      if (message.fix) result.fixableWarningCount += 1;
    }
  }
  return result;
}

// The config of a file for the linter: JSX for .jsx files, and the source type of .cjs and .mjs.
function linterConfig(config, file) {
  const languageOptions = { ...config.languageOptions };
  if (file.endsWith('.cjs')) languageOptions.sourceType ??= 'commonjs';
  if (file.endsWith('.mjs')) languageOptions.sourceType = 'module';
  if (file.endsWith('.jsx')) {
    languageOptions.parserOptions = {
      ...languageOptions.parserOptions,
      ecmaFeatures: { ...languageOptions.parserOptions?.ecmaFeatures, jsx: true },
    };
  }
  return { ...config, languageOptions };
}

/** Lints a file's text with a config (of configs.configFor). */
function lintText(text, config, file, { fix = false } = {}) {
  const linter = new Linter({ cwd: process.cwd() });
  const options = { filename: file, physicalFilename: file };
  const own = linterConfig(config, file);
  if (fix) {
    const result = linter.verifyAndFix(text, own, options);
    return {
      filePath: file,
      messages: result.messages,
      suppressedMessages: linter.getSuppressedMessages(),
      ...count(result.messages),
      ...(result.fixed ? { output: result.output } : {}),
    };
  }
  const messages = linter.verify(text, own, options);
  const result = {
    filePath: file,
    messages,
    suppressedMessages: linter.getSuppressedMessages(),
    ...count(messages),
  };
  if (messages.length) result.source = text;
  return result;
}

/** Lints a file; with fix, writes what is fixed. */
function lintFile(file, configs, { fix = false } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  const result = lintText(text, configs.configFor(file), file, { fix });
  if (fix && result.output !== undefined && result.output !== text) fs.writeFileSync(file, result.output);
  return result;
}

/** Lints the files of `paths`; with fix, writes what is fixed. */
function lintFiles(paths, configs, { fix = false } = {}) {
  return filesOf(paths, configs).map((file) => lintFile(file, configs, { fix }));
}

export { lintFiles, lintFile, lintText, filesOf, linterConfig };
