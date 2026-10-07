// The reference of a package, made from its TypeScript declarations (packages/<name>/index.d.ts): every function,
// class, interface, type and constant it declares, in the order of the file, with its signature and its doc comment
// (/** ... */), and the members of classes and interfaces in tables whose types link to the declarations of the page.
// The declarations of a namespace (`declare namespace x { ... }` with `export = x`, as the packages ported from
// fastify's world write them) are those of the package: they are listed as if they were at the top.
//
//   const { referenceOf } = require('./reference');
//   referenceOf('client'); // { intro, kinds: [[kind, label, count]], body } for pages/... (see pages.js)
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const PACKAGES = path.join(__dirname, '../../../packages');

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The kinds of declarations, in the order of the page: [kind, id of its section, heading].
const KINDS = [
  ['function', 'functions', 'Functions'],
  ['class', 'classes', 'Classes'],
  ['constant', 'constants', 'Constants'],
  ['interface', 'interfaces', 'Interfaces'],
  ['type', 'types', 'Types'],
];

// The text of a doc comment (its tags apart): paragraphs kept, @example as code.
function docOf(node) {
  const docs = (node.jsDoc || []).filter((doc) => doc.kind === ts.SyntaxKind.JSDoc);
  if (docs.length === 0) return { text: '', tags: [] };
  const doc = docs[docs.length - 1];
  const text = ts.getTextOfJSDocComment(doc.comment) || '';
  const tags = (doc.tags || []).map((tag) => ({
    name: tag.tagName.text,
    param: tag.name ? tag.name.getText() : '',
    text: ts.getTextOfJSDocComment(tag.comment) || '',
  }));
  return { text: text.trim(), tags };
}

// A doc comment as HTML: `code` as <code>, paragraphs, and its tags (@param, @returns, @default, @example,
// @deprecated).
function docHtml({ text, tags }, linker) {
  const inline = (value) =>
    esc(value)
      .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
      .replace(/\{@link\s+([^}\s|]+)(?:[\s|]+([^}]+))?\}/g, (_, name, label) => linker.word(name, label));
  const parts = text
    ? text
        .split(/\n\s*\n/)
        .map((paragraph) => `<p>${inline(paragraph.replace(/\s*\n\s*/g, ' '))}</p>`)
        .join('')
    : '';
  const rows = [];
  for (const tag of tags) {
    if (tag.name === 'param')
      rows.push(`<li><code>${esc(tag.param)}</code>: ${inline(tag.text.replace(/^-\s*/, ''))}</li>`);
    else if (tag.name === 'returns' || tag.name === 'return') rows.push(`<li>Returns: ${inline(tag.text)}</li>`);
    else if (tag.name === 'default' || tag.name === 'defaultValue')
      rows.push(`<li>Default: <code>${esc(tag.text)}</code></li>`);
    else if (tag.name === 'deprecated')
      rows.push(`<li><strong>Deprecated</strong>${tag.text ? `: ${inline(tag.text)}` : ''}</li>`);
    else if (tag.name === 'see') rows.push(`<li>See ${inline(tag.text)}</li>`);
  }
  const examples = tags
    .filter((tag) => tag.name === 'example')
    .map((tag) => `<pre><code class="language-ts">${esc(tag.text.replace(/^\s*\n/, '').trimEnd())}</code></pre>`)
    .join('');
  return `${parts}${rows.length ? `<ul class="ref-tags">${rows.join('')}</ul>` : ''}${examples}`;
}

const nameOf = (node) =>
  node.name && ts.isIdentifier(node.name) ? node.name.text : node.name ? node.name.getText() : '';

// The declarations of statements (and of the namespaces among them): [{ kind, name, nodes }], overloads together.
function declarationsOf(statements, out = [], seen = new Map()) {
  const add = (kind, name, node) => {
    const key = `${kind}:${name}`;
    if (seen.has(key)) {
      seen.get(key).nodes.push(node);
      return;
    }
    const entry = { kind, name, nodes: [node] };
    seen.set(key, entry);
    out.push(entry);
  };
  for (const node of statements) {
    if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body)) {
      declarationsOf(node.body.statements, out, seen);
    } else if (ts.isFunctionDeclaration(node) && node.name) add('function', nameOf(node), node);
    else if (ts.isClassDeclaration(node) && node.name) add('class', nameOf(node), node);
    else if (ts.isInterfaceDeclaration(node)) add('interface', nameOf(node), node);
    else if (ts.isTypeAliasDeclaration(node)) add('type', nameOf(node), node);
    else if (ts.isEnumDeclaration(node)) add('type', nameOf(node), node);
    else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        // The doc comment is on the statement.
        add('constant', nameOf(declaration), Object.assign(declaration, { docNode: node }));
      }
    }
  }
  return out;
}

// The text of a declaration as written, without its doc comment (and without the members of an interface or a class,
// which are in its table).
function signatureOf(node, source) {
  const start = node.docNode ? node.docNode.getStart(source) : node.getStart(source);
  if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
    const open = source.text.indexOf('{', node.name ? node.name.end : start);
    return `${source.text.slice(start, open).trim()} { ... }`;
  }
  const end = node.docNode ? node.docNode.end : node.end;
  return dedent(source.text.slice(start, end).trim());
}

// Lines continued as written, without the indentation of a namespace.
function dedent(text) {
  const lines = text.split('\n');
  const indents = lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => /^ */.exec(line)[0].length);
  const cut = Math.min(...indents, Infinity);
  const first = lines[0];
  const shift = Number.isFinite(cut) ? Math.max(0, cut - 2) : 0;
  return [first, ...lines.slice(1).map((line) => line.slice(Math.min(shift, /^ */.exec(line)[0].length)))].join('\n');
}

// A member of an interface or a class: [name, type, doc].
function memberOf(member, source) {
  const doc = docOf(member);
  let name = member.name ? member.name.getText(source) : '';
  let type = '';
  if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
    const readonly = (member.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
    name = `${readonly ? 'readonly ' : ''}${name}${member.questionToken ? '?' : ''}`;
    type = member.type ? member.type.getText(source) : 'any';
  } else if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
    const params = member.parameters.map((p) => p.getText(source)).join(', ');
    const generics = member.typeParameters ? `<${member.typeParameters.map((t) => t.getText(source)).join(', ')}>` : '';
    name = `${name}${member.questionToken ? '?' : ''}${generics}(${params})`;
    type = member.type ? member.type.getText(source) : 'void';
  } else if (ts.isConstructorDeclaration(member) || ts.isConstructSignatureDeclaration(member)) {
    name = `new (${member.parameters.map((p) => p.getText(source)).join(', ')})`;
    type = member.type ? member.type.getText(source) : '';
  } else if (ts.isCallSignatureDeclaration(member)) {
    name = `(${member.parameters.map((p) => p.getText(source)).join(', ')})`;
    type = member.type ? member.type.getText(source) : 'void';
  } else if (ts.isIndexSignatureDeclaration(member)) {
    name = `[${member.parameters.map((p) => p.getText(source)).join(', ')}]`;
    type = member.type ? member.type.getText(source) : '';
  } else if (ts.isGetAccessor(member)) {
    name = `get ${name}`;
    type = member.type ? member.type.getText(source) : '';
  } else {
    return null;
  }
  const isPrivate = (member.modifiers || []).some((m) => m.kind === ts.SyntaxKind.PrivateKeyword);
  if (isPrivate || (name && name.startsWith('#'))) return null;
  const isStatic = (member.modifiers || []).some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
  return [`${isStatic ? 'static ' : ''}${name}`, type.replace(/\s+/g, ' '), doc];
}

// Links to the declarations of the page, in a text of types (already escaped: names are words).
function linkerOf(names) {
  return {
    types(text) {
      return esc(text).replace(/\b[A-Za-z_$][\w$]*\b/g, (word) =>
        names.has(word) ? `<a href="#ref-${word}">${word}</a>` : word
      );
    },
    word(name, label) {
      const shown = esc(label || name);
      return names.has(name) ? `<a href="#ref-${name}"><code>${shown}</code></a>` : `<code>${shown}</code>`;
    },
  };
}

function referenceOf(name) {
  const file = path.join(PACKAGES, name, 'index.d.ts');
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declarations = declarationsOf(source.statements);
  const names = new Set(declarations.map((d) => d.name));
  const linker = linkerOf(names);
  const sections = [];
  const kinds = [];
  for (const [kind, id, heading] of KINDS) {
    const list = declarations.filter((d) => d.kind === kind);
    if (list.length === 0) continue;
    kinds.push([id, heading, list.length]);
    const items = list.map((declaration) => {
      const [first] = declaration.nodes;
      const signatures = declaration.nodes.map((node) => signatureOf(node, source)).join('\n\n');
      const doc = declaration.nodes.map((node) => docOf(node.docNode || node)).find((d) => d.text || d.tags.length) || {
        text: '',
        tags: [],
      };
      let members = '';
      if (ts.isInterfaceDeclaration(first) || ts.isClassDeclaration(first)) {
        const rows = declaration.nodes
          .flatMap((node) => node.members.map((member) => memberOf(member, source)))
          .filter(Boolean);
        if (rows.length) {
          members = `
          <div class="table-wrap">
            <table class="ref-members">
              <thead><tr><th>Member</th><th>Type</th><th></th></tr></thead>
              <tbody>
${rows
  .map(
    ([member, type, memberDoc]) =>
      `                <tr><td><code>${esc(member)}</code></td><td>${type ? `<code>${linker.types(type)}</code>` : ''}</td><td>${docHtml(memberDoc, linker)}</td></tr>`
  )
  .join('\n')}
              </tbody>
            </table>
          </div>`;
        }
      }
      const parts = [docHtml(doc, linker), members.trim()].filter(Boolean).map((part) => `        ${part}`);
      return [
        `        <h3 id="ref-${declaration.name}"><code>${esc(declaration.name)}</code></h3>`,
        `        <pre><code class="language-ts">${esc(signatures)}</code></pre>`,
        ...parts,
      ].join('\n');
    });
    const index = list.map((d) => `<a href="#ref-${d.name}"><code>${esc(d.name)}</code></a>`).join(', ');
    sections.push(
      `        <h2 id="${id}">${heading}</h2>\n        <p class="ref-index">${index}</p>\n\n${items.join('\n\n')}`
    );
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGES, name, 'package.json'), 'utf8'));
  return { intro: pkg.description || '', kinds, declarations, body: sections.join('\n\n') };
}

// The packages that have a page of reference: those whose declarations are xufa's own reading (the umbrella `xufa`
// only re-exports @xufa/http; @xufa/http and @xufa/schema have an API page written by hand).
const REFERENCE_PACKAGES = fs
  .readdirSync(PACKAGES)
  .filter((name) => fs.existsSync(path.join(PACKAGES, name, 'index.d.ts')))
  .filter((name) => !['xufa', 'http', 'schema'].includes(name));

module.exports = { referenceOf, REFERENCE_PACKAGES };
