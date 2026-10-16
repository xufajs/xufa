// Ports DOMPurify (Apache-2.0 or MPL-2.0) to packages/purify/lib: its TypeScript made JavaScript modules, with their
// declarations as tsc makes them (the types of Trusted Types it imports are in lib/trusted-types.d.ts, not a package).
// And its tests to packages/purify/test/upstream: test-suite.js (QUnit, run by test/upstream.test.js on the DOM of
// @xufa/html) and the fixtures of XSS vectors (test/fixtures/expect.mjs).
//
// node tools/port-purify/port.js <dompurify>  (a checkout of github.com/cure53/DOMPurify at a tag)
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node tools/port-purify/port.js <dompurify>');
  process.exit(1);
}
const OUT = path.join(import.meta.dirname, '../../packages/purify');
const LIB = path.join(OUT, 'lib');
const UPSTREAM = path.join(OUT, 'test/upstream');
const SRC = path.join(source, 'src');
const FILES = ['purify.ts', 'attrs.ts', 'tags.ts', 'regexp.ts', 'utils.ts', 'config.ts'];
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;

const header = (origin) => `// Ported from ${origin} by tools/port-purify/port.js: do not edit, change the tool.\n`;
const written = [];
function write(target, code) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, code);
  written.push(target);
}

fs.rmSync(LIB, { recursive: true, force: true });
fs.rmSync(UPSTREAM, { recursive: true, force: true });

// The library.
for (const file of FILES) {
  const code = fs.readFileSync(path.join(SRC, file), 'utf8');
  const { outputText } = ts.transpileModule(code, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true },
  });
  let js = outputText.replace(/from '\.\/(\w+)'/g, "from './$1.js'");
  // (VERSION is filled in when DOMPurify is built: its version, from its package.json.)
  js = js.replace(/\bVERSION\b/g, JSON.stringify(version));
  write(path.join(LIB, file.replace(/\.ts$/, '.js')), header(`DOMPurify's src/${file}`) + js);
}

// The types of Trusted Types it names (from @types/trusted-types, MIT): what DOMPurify's declarations need.
const TRUSTED_TYPES = path.join(LIB, 'trusted-types.d.ts');
write(
  TRUSTED_TYPES,
  `${header("the interfaces of @types/trusted-types (MIT) that DOMPurify's declarations name")}` +
    'export declare class TrustedHTML {\n  private readonly brand: true;\n}\n' +
    'export declare class TrustedScript {\n  private readonly brand: true;\n}\n' +
    'export declare class TrustedScriptURL {\n  private readonly brand: true;\n}\n' +
    'export interface TrustedTypePolicyOptions {\n  createHTML?: ((input: string, ...args: any[]) => string) | undefined;\n' +
    '  createScript?: ((input: string, ...args: any[]) => string) | undefined;\n' +
    '  createScriptURL?: ((input: string, ...args: any[]) => string) | undefined;\n}\n' +
    'export declare class TrustedTypePolicy {\n  readonly name: string;\n  createHTML(input: string, ...args: any[]): TrustedHTML;\n' +
    '  createScript(input: string, ...args: any[]): TrustedScript;\n  createScriptURL(input: string, ...args: any[]): TrustedScriptURL;\n}\n' +
    'export declare class TrustedTypePolicyFactory {\n  createPolicy(policyName: string, policyOptions?: TrustedTypePolicyOptions): TrustedTypePolicy;\n' +
    '  isHTML(value: unknown): value is TrustedHTML;\n  getAttributeType(tagName: string, attribute: string, elementNs?: string, attrNs?: string): string | null;\n}\n' +
    'export interface TrustedTypesWindow {\n  trustedTypes?: TrustedTypePolicyFactory | undefined;\n}\n' +
    // (DOMPurify names some of them as globals too, as @types/trusted-types declares them.)
    'declare global {\n' +
    "  type TrustedTypePolicyFactory = import('./trusted-types.js').TrustedTypePolicyFactory;\n" +
    "  type TrustedTypePolicy = import('./trusted-types.js').TrustedTypePolicy;\n" +
    '}\n'
);

// Their declarations, as tsc makes them.
const declarations = fs.mkdtempSync(path.join(OUT, '.declarations-'));
const program = ts.createProgram(
  FILES.map((file) => path.join(SRC, file)),
  {
    declaration: true,
    emitDeclarationOnly: true,
    outDir: declarations,
    rootDir: SRC,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    skipLibCheck: true,
    strict: false,
    noImplicitAny: false,
    paths: { 'trusted-types/lib/index.js': [TRUSTED_TYPES], 'trusted-types/lib': [TRUSTED_TYPES] },
  }
);
const emitted = program.emit();
const problems = ts
  .getPreEmitDiagnostics(program)
  .concat(emitted.diagnostics)
  .filter((d) => d.category === ts.DiagnosticCategory.Error);
if (problems.length) {
  console.error(ts.formatDiagnostics(problems.slice(0, 10), ts.createCompilerHost({})));
  process.exit(1);
}
for (const file of fs.readdirSync(declarations).filter((name) => name.endsWith('.d.ts'))) {
  let code = fs.readFileSync(path.join(declarations, file), 'utf8');
  code = code
    .replace(/'trusted-types\/lib(\/index\.js)?'/g, "'./trusted-types.js'")
    .replace(/from '\.\/(\w+)'/g, "from './$1.js'");
  write(
    path.join(LIB, file),
    header(`the declarations tsc makes of DOMPurify's src/${file.replace(/\.d\.ts$/, '.ts')}`) + code
  );
}
fs.rmSync(declarations, { recursive: true, force: true });

// The tests: the suite (QUnit) and the fixtures, as they are.
write(
  path.join(UPSTREAM, 'test-suite.cjs'),
  header("DOMPurify's test/test-suite.js") + fs.readFileSync(path.join(source, 'test/test-suite.js'), 'utf8')
);
write(
  path.join(UPSTREAM, 'fixtures/expect.mjs'),
  header("DOMPurify's test/fixtures/expect.mjs") +
    fs.readFileSync(path.join(source, 'test/fixtures/expect.mjs'), 'utf8')
);
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(OUT, 'LICENSE.dompurify'));
console.log(`port-purify: DOMPurify ${version}, ${written.length} files in ${path.relative(process.cwd(), OUT)}`);
