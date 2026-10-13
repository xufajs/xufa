// The severity of a rule's setting: 0 (off), 1 (warn), 2 (error), from a number, its text, or its name.

const SEVERITIES = new Map([
  [0, 0],
  ['0', 0],
  ['off', 0],
  [1, 1],
  ['1', 1],
  ['warn', 1],
  [2, 2],
  ['2', 2],
  ['error', 2],
]);

/** The severity as a number; an error if it is not one. */
function normalizeSeverityToNumber(severity) {
  if (!SEVERITIES.has(severity)) throw new Error(`Invalid severity value: ${severity}`);
  return SEVERITIES.get(severity);
}

export { normalizeSeverityToNumber };
