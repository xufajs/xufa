// What is done with a file, by name, for lib/parallel.js (here and in its workers): each task is loaded when first
// used (formatting loads the formatter, not linting).
//
//   const run = await TASKS.lint();  run(file, configs, options) -> its result

const TASKS = {
  lint: async () => (await import('./engine.js')).lintFile,
  format: async () => (await import('./format/index.js')).formatFile,
  check: async () => (await import('./check.js')).checkFile,
};

export { TASKS };
