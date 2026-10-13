// What the converter reads of TypeScript before it converts: its SyntaxKind and ScriptKind, and whether its version is
// at least one (the converter reads what newer versions give, as typescript-estree's version-check does).
//
// They are set by loadTypeScript(), which parse() calls first: nothing of TypeScript is loaded until a file is parsed
// with it (formatting markdown, package.json or, with its own parser, JSON never loads it). Modules import them as
// bindings, which are read as variables.
import ts from '../typescript.cjs';

/** @type {typeof ts.SyntaxKind} */
export let SyntaxKind;
/** @type {typeof ts.ScriptKind} */
export let ScriptKind;
export let isAtLeast48 = false;
export let isAtLeast50 = false;
export let isAtLeast59 = false;

let major = 0;
let minor = 0;

export function loadTypeScript() {
  if (SyntaxKind !== undefined) {
    return;
  }
  [major, minor] = ts.versionMajorMinor.split('.').map(Number);
  isAtLeast48 = atLeast(4, 8);
  isAtLeast50 = atLeast(5, 0);
  isAtLeast59 = atLeast(5, 9);
  ScriptKind = ts.ScriptKind;
  SyntaxKind = ts.SyntaxKind;
}

function atLeast(wantedMajor, wantedMinor) {
  return major > wantedMajor || (major === wantedMajor && minor >= wantedMinor);
}

// typescriptVersionIsAtLeast['5.9'], as typescript-estree has it.
export const typescriptVersionIsAtLeast = new Proxy(
  {},
  {
    get(target, version) {
      loadTypeScript();
      const [wantedMajor, wantedMinor] = String(version).split('.').map(Number);
      return atLeast(wantedMajor, wantedMinor);
    },
  }
);
